import { Router, type RequestHandler } from 'express'
import { createHash, timingSafeEqual } from 'node:crypto'
import { orm } from '../../../infrastructure/database/orm.js'
import { User } from '../../../features/identity/User.js'
import { Source } from '../../../features/sources/Source.js'
import { Entry, TaskStatus } from '../../../features/entries/Entry.js'
import { EntryType } from '../../../features/entries/EntryType.js'
import { AppleRemindersShortcut, type AppleReminderInput, type AppleRemindersSyncState } from '../AppleRemindersShortcut.js'
import { syncEmitter } from '../../../infrastructure/realtime/syncEmitter.js'

const router = Router()

declare global {
	namespace Express {
		interface Request {
			appleRemindersIntegrationId?: string
		}
	}
}

function hashToken(value: string): Buffer {
	return createHash('sha256').update(value).digest()
}

function matchesToken(candidate: string, saved: string): boolean {
	return timingSafeEqual(hashToken(candidate), hashToken(saved))
}

const authenticateShortcut: RequestHandler = async (req, res, next) => {
	const match = /^Bearer\s+(.+)$/i.exec(req.get('authorization') ?? '')
	const token = match?.[1]?.trim()
	if (!token || token.length > 1024) {
		return res.status(401).json({ error: 'A valid Shortcut bearer token is required' })
	}

	const em = orm.em.fork()
	const integrations = await em.find(AppleRemindersShortcut, {})
	const integration = integrations.find(candidate => candidate.credentials.token && matchesToken(token, candidate.credentials.token))
	if (!integration) {
		return res.status(401).json({ error: 'A valid Shortcut bearer token is required' })
	}
	const user = await em.findOne(User, { id: integration.userId })
	if (!user) {
		return res.status(401).json({ error: 'A valid Shortcut bearer token is required' })
	}
	// The integration token is scoped to this user's Apple Reminders source, not to the general API.
	req.user = user
	req.appleRemindersIntegrationId = integration.id
	return next()
}

function validItem(value: unknown): value is AppleReminderInput {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const item = value as Record<string, unknown>
	return (item.id === undefined || (typeof item.id === 'string' && item.id.length <= 80))
		&& (item.clientRef === undefined || (typeof item.clientRef === 'string' && item.clientRef.length <= 100))
		&& typeof item.title === 'string' && item.title.length <= 2000
		&& (item.notes === undefined || item.notes === null || (typeof item.notes === 'string' && item.notes.length <= 20000))
		&& (item.dueDate === undefined || item.dueDate === null || (typeof item.dueDate === 'string' && Number.isFinite(Date.parse(item.dueDate))))
		&& (item.completed === undefined || typeof item.completed === 'boolean')
		&& (item.modifiedAt === undefined || item.modifiedAt === null || (typeof item.modifiedAt === 'string' && Number.isFinite(Date.parse(item.modifiedAt))))
}

function sameSnapshot(a: AppleRemindersSyncState['snapshot'], b: AppleRemindersSyncState['snapshot']): boolean {
	return a.heading === b.heading && a.description === b.description && a.date === b.date
		&& a.allDay === b.allDay && a.completed === b.completed
}

router.use(authenticateShortcut)

export async function syncReminderSnapshot(
	em: import('@mikro-orm/sqlite').EntityManager,
	source: Source,
	reminders: AppleReminderInput[],
	completeSnapshot: boolean,
	now = Date.now(),
) {
	const current = await em.find(Entry, { sourceId: source.id, type: EntryType.Task })
	const byId = new Map(current.map(entry => [entry.id!, entry]))
	const byClientRef = new Map<string, Entry>()
	for (const existing of current) {
		const clientRef = AppleRemindersShortcut.stateOf(existing)?.clientRef
		if (clientRef) byClientRef.set(clientRef, existing)
	}
	const presentIds = new Set<string>()
	let changed = false

	for (const item of reminders) {
		let entry = item.id ? byId.get(item.id) : undefined
		entry ??= item.clientRef ? byClientRef.get(item.clientRef) : undefined
		const isNew = !entry
		if (!entry) {
			entry = new Entry({ id: crypto.randomUUID(), sourceId: source.id, type: EntryType.Task })
			em.persist(entry)
		}
		if ((item.id || item.clientRef) && entry.id) presentIds.add(entry.id)

		const state = AppleRemindersShortcut.stateOf(entry)
		const incoming = new Entry({ sourceId: source.id, type: EntryType.Task })
		AppleRemindersShortcut.applyReminder(incoming, item)
		const incomingSnapshot = AppleRemindersShortcut.snapshotOf(incoming)
		const serverSnapshot = AppleRemindersShortcut.snapshotOf(entry)
		const deviceChanged = !state || !sameSnapshot(state.snapshot, incomingSnapshot)
		const serverChanged = !!state && !sameSnapshot(state.snapshot, serverSnapshot)
		const deviceModifiedAt = item.modifiedAt ? Date.parse(item.modifiedAt) : null
		const deviceIsNewer = deviceModifiedAt !== null && (!state?.syncedAt || deviceModifiedAt > state.syncedAt)

		// If both sides changed since the previous exchange, prefer the device only when its
		// reminder modification time proves it changed after that exchange; otherwise keep Mitra's edit.
		if (isNew || deviceChanged && (!serverChanged || deviceIsNewer)) {
			AppleRemindersShortcut.applyReminder(entry, item)
			changed = true
		}
		AppleRemindersShortcut.saveState(entry, {
			snapshot: AppleRemindersShortcut.snapshotOf(entry),
			syncedAt: now,
			deviceModifiedAt: deviceModifiedAt ?? state?.deviceModifiedAt ?? null,
			acknowledged: true,
			clientRef: item.id ? undefined : item.clientRef ?? state?.clientRef,
		})
	}

	if (completeSnapshot) {
		for (const entry of current) {
			const state = AppleRemindersShortcut.stateOf(entry)
			if (state?.acknowledged && !presentIds.has(entry.id!)) {
				em.remove(entry)
				changed = true
			}
		}
	}

	await em.flush()
	const tasks = (await em.find(Entry, { sourceId: source.id, type: EntryType.Task })).map(entry => ({
		id: entry.id,
		clientRef: AppleRemindersShortcut.stateOf(entry)?.clientRef,
		title: entry.heading,
		notes: entry.description,
		dueDate: AppleRemindersShortcut.dateForShortcut(entry),
		allDay: entry.allDay,
		completed: entry.status === TaskStatus.Done,
	}))
	return { tasks, changed }
}

router.post('/sync', async (req, res) => {
	const body = req.body as { reminders?: unknown, completeSnapshot?: unknown, sourceId?: unknown }
	if (!Array.isArray(body.reminders) || body.reminders.length > 2000 || body.reminders.some(item => !validItem(item))) {
		return res.status(400).json({ error: 'reminders must be an array of valid reminder objects (maximum 2000)' })
	}
	if (body.completeSnapshot !== undefined && typeof body.completeSnapshot !== 'boolean') {
		return res.status(400).json({ error: 'completeSnapshot must be a boolean' })
	}
	const duplicateIds = new Set<string>()
	const duplicateClientRefs = new Set<string>()
	for (const item of body.reminders as Array<AppleReminderInput>) {
		if (item.id && duplicateIds.has(item.id)) {
			return res.status(400).json({ error: 'reminder IDs must be unique within a snapshot' })
		}
		if (item.clientRef && duplicateClientRefs.has(item.clientRef)) {
			return res.status(400).json({ error: 'clientRef values must be unique within a snapshot' })
		}
		if (item.id) duplicateIds.add(item.id)
		if (item.clientRef) duplicateClientRefs.add(item.clientRef)
	}

	const em = orm.em.fork()
	const integration = await em.findOne(AppleRemindersShortcut, {
		id: req.appleRemindersIntegrationId,
		userId: req.user.id,
	})
	if (!integration) {
		return res.status(401).json({ error: 'A valid Shortcut bearer token is required' })
	}
	const sources = await em.find(Source, { integrationId: integration.id })
	const requestedSourceId = typeof body.sourceId === 'string' ? body.sourceId : undefined
	const source = requestedSourceId
		? sources.find(candidate => candidate.id === requestedSourceId)
		: sources.length === 1 ? sources[0] : undefined
	if (!source) {
		return res.status(409).json({ error: 'Choose one Apple Reminders source; sourceId is required when the integration has more than one' })
	}

	const now = Date.now()
	const result = await syncReminderSnapshot(em, source, body.reminders as AppleReminderInput[], body.completeSnapshot === true, now)
	if (result.changed) syncEmitter.emit('updated', req.user.id)
	return res.json({ sourceId: source.id, tasks: result.tasks, syncedAt: new Date(now).toISOString() })
})

export const appleRemindersShortcutRouter = router
