import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Todoist } from './Todoist.js'
import { type TodoistTask } from './TodoistClient.js'
import { Entry } from '../../features/entries/Entry.js'
import { EntryType } from '../../features/entries/EntryType.js'

const D = (iso: string) => new Date(iso) as Entry['start']
const remote = (date: string, duration: TodoistTask['duration'] = null): TodoistTask => ({ id: 'task-1', project_id: 'project-1', content: 'Calendar block', due: { date, timezone: 'Europe/Madrid' }, duration })

describe('Todoist local duration fallback', () => {
	it('retains a requested block when Todoist ignores durations, including subsequent imports and moves', () => {
		const entry = new Entry({ type: EntryType.Task, start: D('2026-10-15T12:00:00Z'), end: D('2026-10-15T13:00:00Z') })
		Todoist.rememberDuration(entry, entry, remote('2026-10-15T12:00:00Z'))
		Todoist.applyTask(entry, remote('2026-10-15T12:00:00Z'))
		assert.equal(entry.end?.toISOString(), '2026-10-15T13:00:00.000Z')
		Todoist.applyTask(entry, remote('2026-10-16T14:00:00Z'))
		assert.equal(entry.end?.toISOString(), '2026-10-16T15:00:00.000Z')
		const incoming = entry.clone()
		incoming.end = D('2026-10-16T15:30:00Z')
		Todoist.rememberDuration(entry, incoming, remote('2026-10-16T14:00:00Z'))
		Todoist.applyTask(entry, remote('2026-10-16T14:00:00Z'))
		assert.equal(entry.end?.toISOString(), '2026-10-16T15:30:00.000Z')
		assert.equal(entry.data?.todoistDurationMinutes, 90)
	})

	it('adopts native durations and removes the fallback so native clearing is respected', () => {
		const entry = new Entry({ type: EntryType.Task, data: { todoistDurationMinutes: 60 } })
		Todoist.applyTask(entry, remote('2026-10-15T12:00:00Z', { amount: 30, unit: 'minute' }))
		assert.equal(entry.end?.toISOString(), '2026-10-15T12:30:00.000Z')
		assert.equal(entry.data?.todoistDurationMinutes, undefined)
		Todoist.applyTask(entry, remote('2026-10-15T12:00:00Z'))
		assert.equal(entry.end, undefined)
	})

	it('clears the fallback when the user removes the duration or changes to all-day', () => {
		for (const allDay of [false, true]) {
			const entry = new Entry({ type: EntryType.Task, data: { todoistDurationMinutes: 60 } })
			const incoming = new Entry({ type: EntryType.Task, start: D('2026-10-15T12:00:00Z'), allDay })
			Todoist.rememberDuration(entry, incoming, remote('2026-10-15T12:00:00Z'))
			assert.equal(entry.data?.todoistDurationMinutes, undefined)
		}
	})

	it('retains an estimate while an externally unscheduled task has no start', () => {
		const entry = new Entry({ type: EntryType.Task, data: { todoistDurationMinutes: 45 } })
		Todoist.applyTask(entry, { ...remote('2026-10-15T12:00:00Z'), due: null })
		assert.equal(entry.start, undefined)
		assert.equal(entry.estimate, 45)
	})
})
