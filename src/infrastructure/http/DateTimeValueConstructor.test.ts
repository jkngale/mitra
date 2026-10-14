import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Api } from '@a11d/api'
import { DateTime } from '@3mo/date-time'
import { DateTimeValueConstructor } from './DateTimeValueConstructor.js'
import { wireOf } from '../model/wire.testing.js'
import { Entry } from '../../features/entries/Entry.js'
import { EntryType } from '../../features/entries/EntryType.js'

const revive = <T>(value: unknown): T => JSON.parse(JSON.stringify(value), (_key, value) => [...Api.valueConstructors].find(constructor => constructor.shallConstruct(value))?.construct(value) ?? value) as T

describe('API date revival', () => {
	it('revives complete ISO timestamps with UTC or explicit offsets', () => {
		const constructor = new DateTimeValueConstructor()
		for (const date of ['2026-10-15T12:00:00Z', '2026-10-15T12:00:00.000Z', '2026-10-15T14:00:00+02:00', '2026-10-15T14:00+02:00']) {
			assert.equal(constructor.shallConstruct(date), true)
			assert.ok(revive(date) instanceof DateTime)
		}
	})

	it('keeps embedded dates in Todoist metadata, calendar data and descriptions as text', () => {
		const raw = 'todoist-due:{"date":"2026-10-15T12:00:00Z","timezone":"Europe/Madrid"}'
		const description = 'Starts at 2026-10-15T12:00:00Z. Check the agenda.'
		const entry = revive<Entry>({ '@type': 'Entry', id: 'task-1', sourceId: 'source-1', type: 'task', heading: 'Calendar block', start: '2026-10-15T12:00:00Z', end: '2026-10-15T13:00:00Z', description, data: { raw } })
		assert.ok(entry instanceof Entry)
		assert.equal(entry.type, EntryType.Task)
		assert.equal(entry.data?.raw, raw)
		assert.equal(entry.description, description)
		assert.equal(wireOf(entry).data.raw, raw)
		assert.equal(wireOf(entry).start, '2026-10-15T12:00:00.000Z')
		assert.equal(revive('BEGIN:VCALENDAR\nDESCRIPTION:2026-10-15T12:00:00Z\nEND:VCALENDAR'), 'BEGIN:VCALENDAR\nDESCRIPTION:2026-10-15T12:00:00Z\nEND:VCALENDAR')
	})
})
