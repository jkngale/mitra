import { type EntityManager } from '@mikro-orm/sqlite'
import { converter } from '@a11d/converter'
import { model } from '../../infrastructure/model/model.js'
import { Integration, integration } from '../Integration.js'
import { withheld } from '../../infrastructure/model/withheld.js'
import { Source } from '../../features/sources/Source.js'
import { Color } from '../../features/sources/Color.js'
import { Entry, TaskStatus } from '../../features/entries/Entry.js'
import { EntryType } from '../../features/entries/EntryType.js'
import { calendarDateOf, midnightOf } from '../../features/time/calendarDate.js'
import { TodoistClient, type TodoistProject, type TodoistTask, type TodoistTaskInput } from './TodoistClient.js'

export interface TodoistCredentials {
	username: string
	token: string
}

/**
 * Todoist projects are task sources. Todoist's due date is the schedule; its
 * separate deadline maps to Mitra's deadline constraint.
 */
@model('Todoist')
@integration('todoist')
export class Todoist extends Integration<TodoistCredentials> {
	static readonly label = 'Todoist'
	static readonly logo = 'todoist'
	static readonly description = 'Your Todoist projects and tasks'
	static override readonly onePerUser = true
	static readonly uriPrefix = 'todoist://project/'
	static readonly accountUri = 'todoist://account'

	@converter(withheld<TodoistCredentials>('token')) override credentials!: TodoistCredentials

	constructor(init?: Partial<Todoist>) {
		super()
		this.uri = Todoist.accountUri
		this.credentials = { username: '', token: '' }
		Object.assign(this, init)
	}

	override toString() {
		return `Todoist integration${this.credentials.username ? ` for "${this.credentials.username}"` : ''}`
	}

	override get canConnect() { return !!this.credentials.token }
	override get syncInterval() { return 60_000 }

	override get capabilities() {
		return {
			...Integration.defaultCapabilities,
			availability: false,
			recurrence: false,
			reminders: false,
			location: false,
			cancelledStatus: false,
			percentComplete: false,
			timeZone: true,
			participants: false,
			transparency: false,
			visibility: false,
			createSources: false,
			deleteSources: false,
		}
	}

	override merge(incoming: this) {
		this.credentials = {
			username: this.credentials.username || incoming.credentials.username || '',
			token: incoming.credentials?.token || this.credentials.token,
		}
	}

	@converter({ out: {} }) private client?: TodoistClient

	protected createClient(): TodoistClient {
		return new TodoistClient(this.credentials.token)
	}

	protected getClient(): TodoistClient {
		return this.client ??= this.createClient()
	}

	static sourceUri(projectId: string): string {
		return `${Todoist.uriPrefix}${encodeURIComponent(projectId)}`
	}

	static projectIdOf(source: Pick<Source, 'uri'>): string {
		if (!source.uri.startsWith(Todoist.uriPrefix)) {
			throw new Error(`Not a Todoist source uri: ${source.uri}`)
		}
		const id = decodeURIComponent(source.uri.slice(Todoist.uriPrefix.length))
		if (!id) {
			throw new Error(`Not a Todoist source uri: ${source.uri}`)
		}
		return id
	}

	protected override async fetchSources(): Promise<Array<Source>> {
		this.uri = Todoist.accountUri
		const projects = await this.getClient().projects()
		const sources = projects
			.filter(project => !project.is_archived && !project.is_deleted)
			.map(project => Todoist.sourceFrom(project))
		if (!sources.length) {
			throw new Error('Todoist returned no active projects')
		}
		return sources
	}

	static sourceFrom(project: TodoistProject): Source {
		const uri = Todoist.sourceUri(project.id)
		return new Source({
			uri,
			entryTypes: [EntryType.Task],
			name: project.name,
			color: Color.get(uri).value,
			enabled: false,
		})
	}

	protected override async syncSourceEntries(em: EntityManager, source: Source): Promise<boolean> {
		const projectId = Todoist.projectIdOf(source)
		const today = Temporal.Now.plainDateISO()
		// Todoist limits completed-task queries to a six-week window.
		const since = today.subtract({ days: 40 }).toString()
		const until = today.toString()
		const [active, completed] = await Promise.all([
			this.getClient().tasks(projectId),
			this.getClient().completedTasks(projectId, since, until),
		])
		const remoteById = new Map<string, TodoistTask>()
		for (const task of [...completed, ...active]) {
			if (task.project_id === projectId && !task.is_deleted) {
				remoteById.set(String(task.id), task)
			}
		}

		const existing = await this.syncedEntries(em, source)
		const existingByUri = new Map(existing.map(entry => [entry.uri ?? '', entry]))
		let changed = false
		for (const entry of existing) {
			if (entry.uri && !remoteById.has(entry.uri) && entry.status !== TaskStatus.Done) {
				em.remove(entry)
				changed = true
			}
		}

		for (const task of remoteById.values()) {
			const uri = String(task.id)
			const entry = existingByUri.get(uri) ?? new Entry({ id: crypto.randomUUID(), sourceId: source.id, uri })
			const before = existingByUri.get(uri)?.clone()
			if (!before) {
				em.persist(entry)
			}
			Todoist.applyTask(entry, task)
			if (!before || !before.editEquals(entry)) {
				changed = true
			}
		}
		return changed
	}

	override async createEntry(em: EntityManager, entry: Entry): Promise<Entry> {
		if (entry.type !== EntryType.Task) {
			throw new Error('Todoist only stores tasks')
		}
		if (entry.status === TaskStatus.Cancelled) {
			throw new Error('Todoist does not support cancelled tasks')
		}
		const projectId = Todoist.projectIdOf(await em.findOneOrFail(Source, { id: entry.sourceId }))
		const requestedStatus = entry.status
		const task = await this.getClient().createTask(Todoist.inputFrom(entry, projectId))
		Todoist.applyTask(entry, task)
		if (requestedStatus === TaskStatus.Done) {
			await this.getClient().closeTask(task.id)
			entry.status = TaskStatus.Done
		}
		em.persist(entry)
		return entry
	}

	override async updateEntry(_em: EntityManager, existing: Entry, incoming: Entry): Promise<void> {
		if (incoming.type !== EntryType.Task) {
			throw new Error('Todoist only stores tasks')
		}
		if (incoming.status === TaskStatus.Cancelled) {
			throw new Error('Todoist does not support cancelled tasks')
		}
		if (!existing.uri) {
			throw new Error('Entry has no Todoist task id')
		}
		const contentChanged = !existing.editEquals(incoming)
		const statusChanged = (existing.status === TaskStatus.Done) !== (incoming.status === TaskStatus.Done)
		if (!contentChanged && !statusChanged) {
			return
		}
		const projectId = Todoist.projectIdOf(await _em.findOneOrFail(Source, { id: existing.sourceId }))
		if (contentChanged) {
			await this.getClient().updateTask(existing.uri, Todoist.inputFrom(incoming, projectId, true, existing))
		}
		if (statusChanged) {
			if (incoming.status === TaskStatus.Done) {
				await this.getClient().closeTask(existing.uri)
			} else {
				await this.getClient().reopenTask(existing.uri)
			}
		}
		const refreshed = await this.getClient().task(existing.uri)
		Todoist.applyTask(existing, refreshed)
	}

	override async deleteEntry(_em: EntityManager, entry: Entry): Promise<void> {
		if (entry.uri) {
			await this.getClient().deleteTask(entry.uri)
		}
		_em.remove(entry)
	}

	static applyTask(entry: Entry, task: TodoistTask): void {
		const schedule = Todoist.scheduleOf(task)
		entry.type = EntryType.Task
		entry.uri = String(task.id)
		entry.uid = String(task.id)
		entry.heading = task.content || 'Untitled Task'
		entry.description = task.description ?? ''
		entry.status = task.checked ? TaskStatus.Done : TaskStatus.ToDo
		entry.start = schedule.start
		entry.end = schedule.end
		entry.allDay = schedule.allDay || (!task.due?.datetime && !!task.deadline)
		entry.timeZone = schedule.timeZone
		entry.due = Todoist.deadlineOf(task.deadline)
		entry.estimate = schedule.estimate
		entry.percentComplete = null
		entry.location = ''
		entry.color = null
		entry.reminders = null
		entry.recurrence = null
		entry.data = {
			url: task.url,
			raw: task.due?.is_recurring ? `todoist-recurring:${task.due.string ?? task.due.date}` : undefined,
		}
	}

	static scheduleOf(task: TodoistTask): Pick<Entry, 'start' | 'end' | 'allDay' | 'timeZone' | 'estimate'> {
		const due = task.due
		const duration = task.duration ? task.duration.amount * (task.duration.unit === 'day' ? 1440 : 1) : undefined
		if (!due) {
			return { start: undefined, end: undefined, allDay: false, timeZone: null, estimate: duration ?? null }
		}
		if (due.datetime) {
			const start = new Date(due.datetime) as never
			return {
				start,
				end: duration ? new Date((start as Date).getTime() + duration * 60_000) as never : undefined,
				allDay: false,
				timeZone: due.timezone ?? null,
				estimate: null,
			}
		}
		const date = Temporal.PlainDate.from(due.date)
		return {
			start: midnightOf(date, 'UTC') as never,
			end: midnightOf(date.add({ days: 1 }), 'UTC') as never,
			allDay: true,
			timeZone: null,
			estimate: null,
		}
	}

	static deadlineOf(deadline: TodoistTask['deadline']): Entry['due'] {
		return deadline?.date ? midnightOf(Temporal.PlainDate.from(deadline.date), 'UTC') as never : undefined
	}

	static inputFrom(entry: Entry, projectId: string, forUpdate = false, existing?: Entry): TodoistTaskInput {
		const input: TodoistTaskInput = {
			content: entry.heading,
			description: entry.description ?? '',
			...(forUpdate ? {} : { project_id: projectId }),
		}
		const recurring = existing?.data?.raw?.startsWith('todoist-recurring:') ?? false
		if (!recurring) {
			if (entry.start) {
				if (entry.allDay) {
					input.due_date = calendarDateOf(entry.start as never, 'UTC').toString()
				} else {
					input.due_datetime = (entry.start as Date).toISOString()
				}
				const minutes = entry.allDay ? undefined : entry.end
					? Math.max(1, Math.round(((entry.end as Date).getTime() - (entry.start as Date).getTime()) / 60_000))
					: entry.estimate ?? undefined
				if (minutes) {
					input.duration = minutes
					input.duration_unit = 'minute'
				} else if (forUpdate) {
					input.duration = null
				}
			} else {
				if (forUpdate) {
					input.due_string = 'no date'
				}
				if (entry.estimate) {
					input.duration = entry.estimate
					input.duration_unit = 'minute'
				} else if (forUpdate) {
					input.duration = null
				}
			}
		}
		if (entry.due) {
			input.deadline_date = calendarDateOf(entry.due as never, 'UTC').toString()
		} else if (forUpdate) {
			input.deadline_date = null
		}
		return input
	}


	override async excludeOccurrence(): Promise<void> {
		throw new Error('Todoist recurrence is managed by Todoist')
	}
}
