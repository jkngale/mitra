import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import '../registerIntegrations.js'
import { AppleRemindersShortcut } from './AppleRemindersShortcut.js'
import { Entry, TaskStatus } from '../../features/entries/Entry.js'
import { EntryType } from '../../features/entries/EntryType.js'

const makeEntry = () => new Entry({ sourceId: 'source-1', type: EntryType.Task })

describe('Apple Reminders task mapping', () => {
	it('maps a date-only reminder to a canonical all-day task', () => {
		const entry = makeEntry()
		AppleRemindersShortcut.applyReminder(entry, {
			title: 'Book the appointment',
			notes: 'Call before going',
			dueDate: '2026-06-11',
		})

		assert.equal(entry.heading, 'Book the appointment')
		assert.equal(entry.description, 'Call before going')
		assert.equal(entry.start?.toISOString(), '2026-06-11T00:00:00.000Z')
		assert.equal(entry.end?.toISOString(), '2026-06-12T00:00:00.000Z')
		assert.equal(entry.allDay, true)
		assert.equal(AppleRemindersShortcut.dateForShortcut(entry), '2026-06-11')
	})

	it('maps a timed reminder and completion state', () => {
		const entry = makeEntry()
		AppleRemindersShortcut.applyReminder(entry, {
			title: 'Collect the parcel',
			dueDate: '2026-06-11T15:30:00.000Z',
			completed: true,
		})

		assert.equal(entry.start?.toISOString(), '2026-06-11T15:30:00.000Z')
		assert.equal(entry.end, undefined)
		assert.equal(entry.allDay, false)
		assert.equal(entry.status, TaskStatus.Done)
		assert.equal(AppleRemindersShortcut.dateForShortcut(entry), '2026-06-11T15:30:00.000Z')
	})

	it('clears the date when an unscheduled reminder is received', () => {
		const entry = makeEntry()
		AppleRemindersShortcut.applyReminder(entry, { title: 'Someday', dueDate: null })
		assert.equal(entry.start, undefined)
		assert.equal(entry.end, undefined)
		assert.equal(entry.allDay, false)
	})

	it('round-trips the private sync baseline in Entry.data.raw', () => {
		const entry = makeEntry()
		AppleRemindersShortcut.applyReminder(entry, { title: 'Read the guide', dueDate: null })
		const state = {
			snapshot: AppleRemindersShortcut.snapshotOf(entry),
			syncedAt: 1234,
			deviceModifiedAt: null,
			acknowledged: false,
			clientRef: 'local-ref-1',
		}
		AppleRemindersShortcut.saveState(entry, state)
		assert.deepEqual(AppleRemindersShortcut.stateOf(entry), state)
	})
})

describe('Apple Reminders integration configuration', () => {
	it('requires a token and exposes only task-oriented capabilities', () => {
		const integration = new AppleRemindersShortcut()
		assert.equal(integration.type, 'apple-reminders')
		assert.equal(integration.canConnect, false)
		integration.credentials.token = 'test-token'
		assert.equal(integration.canConnect, true)
		assert.equal(integration.capabilities.recurrence, false)
		assert.equal(integration.capabilities.createSources, true)
	})
})
