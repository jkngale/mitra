import { type EntityManager } from '@mikro-orm/sqlite'
import { converter } from '@a11d/converter'
import { model } from '../../infrastructure/model/model.js'
import { Integration, integration } from '../Integration.js'
import { withheld } from '../../infrastructure/model/withheld.js'
import { MitraCalendar } from '../mitra/MitraCalendar.js'
import { Source } from '../../features/sources/Source.js'
import { Entry, TaskStatus } from '../../features/entries/Entry.js'
import { EntryType, EntryTypes } from '../../features/entries/EntryType.js'
import { calendarDateOf, midnightOf } from '../../features/time/calendarDate.js'

export interface AppleRemindersCredentials {
	token: string
}

export interface AppleReminderSnapshot {
	heading: string
	description: string
	date: string | null
	allDay: boolean
	completed: boolean
}

export interface AppleRemindersSyncState {
	snapshot: AppleReminderSnapshot
	syncedAt: number
	deviceModifiedAt: number | null
	acknowledged: boolean
	clientRef?: string
}

export interface AppleReminderInput {
	id?: string
	clientRef?: string
	title: string
	notes?: string | null
	dueDate?: string | null
	completed?: boolean
	modifiedAt?: string | null
}

/** One local Mitra task source synchronized by a token-authenticated iOS Shortcut. */
@model('AppleRemindersShortcut')
@integration('apple-reminders')
export class AppleRemindersShortcut extends MitraCalendar {
	static override readonly label = 'Apple Reminders'
	static override readonly logo = 'apple'
	static override readonly description = 'Reminders on your iPhone or iPad, via Shortcuts'
	static override readonly onePerUser = true
	static override readonly discoversSources = false
	static override readonly uri = 'apple-reminders://account'
	static readonly sourcePrefix = 'apple-reminders://source/'
	static readonly statePrefix = 'apple-reminders-sync:'

	@converter(withheld<AppleRemindersCredentials>('token')) override credentials!: AppleRemindersCredentials

	constructor(init?: Partial<AppleRemindersShortcut>) {
		super()
		this.uri = AppleRemindersShortcut.uri
		this.credentials = { token: '' }
		Object.assign(this, init)
	}

	override toString() {
		return 'Apple Reminders Shortcut integration'
	}

	override get canConnect() { return !!this.credentials.token }

	override get capabilities() {
		return {
			...Integration.defaultCapabilities,
			availability: false,
			recurrence: false,
			reminders: false,
			location: false,
			cancelledStatus: false,
			percentComplete: false,
			due: false,
			estimate: false,
			timeZone: false,
			participants: false,
			transparency: false,
			visibility: false,
			relations: false,
			createSources: true,
			deleteSources: false,
		}
	}

	override merge(incoming: this) {
		this.credentials = { token: incoming.credentials?.token || this.credentials.token }
	}

	static override sourceUri(sourceId: string) {
		return `${AppleRemindersShortcut.sourcePrefix}${encodeURIComponent(sourceId)}`
	}

	override createSource(em: EntityManager, source: Source): Promise<Source> {
		source.integrationId = this.id
		source.uri ||= AppleRemindersShortcut.sourceUri(source.id)
		source.entryTypes = EntryTypes.parse([EntryType.Task])
		source.markImported()
		em.persist(source)
		return Promise.resolve(source)
	}

	override get reimportable() { return false }

	override reimportSource(_em: EntityManager, _source: Source): Promise<void> {
		return Promise.resolve()
	}

	override async createEntry(em: EntityManager, entry: Entry): Promise<Entry> {
		const created = await super.createEntry(em, entry)
		AppleRemindersShortcut.saveState(created, {
			snapshot: AppleRemindersShortcut.snapshotOf(created),
			syncedAt: Date.now(),
			deviceModifiedAt: null,
			acknowledged: false,
		})
		return created
	}

	static snapshotOf(entry: Pick<Entry, 'heading' | 'description' | 'start' | 'allDay' | 'status'>): AppleReminderSnapshot {
		const date = !entry.start ? null : entry.allDay
			? calendarDateOf(entry.start as never, 'UTC').toString()
			: (entry.start as Date).toISOString()
		return {
			heading: entry.heading,
			description: entry.description ?? '',
			date,
			allDay: entry.allDay,
			completed: entry.status === TaskStatus.Done,
		}
	}

	static applyReminder(entry: Entry, reminder: AppleReminderInput): void {
		entry.type = EntryType.Task
		entry.heading = reminder.title.trim() || 'Untitled Reminder'
		entry.description = reminder.notes ?? ''
		entry.status = reminder.completed ? TaskStatus.Done : TaskStatus.ToDo
		entry.percentComplete = null
		entry.location = ''
		entry.color = null
		entry.reminders = null
		entry.recurrence = null
		entry.due = undefined
		entry.estimate = null
		if (!reminder.dueDate) {
			entry.start = undefined
			entry.end = undefined
			entry.allDay = false
			entry.timeZone = null
		} else if (/^\d{4}-\d{2}-\d{2}$/.test(reminder.dueDate)) {
			const day = Temporal.PlainDate.from(reminder.dueDate)
			entry.start = midnightOf(day, 'UTC') as never
			entry.end = midnightOf(day.add({ days: 1 }), 'UTC') as never
			entry.allDay = true
			entry.timeZone = null
		} else {
			entry.start = new Date(reminder.dueDate) as never
			entry.end = undefined
			entry.allDay = false
			entry.timeZone = null
		}
	}

	static stateOf(entry: Pick<Entry, 'data'>): AppleRemindersSyncState | undefined {
		const raw = entry.data?.raw
		if (!raw?.startsWith(AppleRemindersShortcut.statePrefix)) {
			return undefined
		}
		try {
			return JSON.parse(raw.slice(AppleRemindersShortcut.statePrefix.length)) as AppleRemindersSyncState
		} catch {
			return undefined
		}
	}

	static saveState(entry: Entry, state: AppleRemindersSyncState): void {
		entry.data = { ...entry.data, raw: `${AppleRemindersShortcut.statePrefix}${JSON.stringify(state)}` }
	}

	static dateForShortcut(entry: Pick<Entry, 'start' | 'allDay'>): string | null {
		if (!entry.start) {
			return null
		}
		return entry.allDay ? calendarDateOf(entry.start as never, 'UTC').toString() : (entry.start as Date).toISOString()
	}
}
