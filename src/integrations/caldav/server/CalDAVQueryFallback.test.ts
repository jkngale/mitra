import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CalDAV } from '../CalDAV.js'
import { CalDAVSyncEngine } from './CalDAVSyncEngine.js'
import { Source } from '../../../features/sources/Source.js'
import { Entry } from '../../../features/entries/Entry.js'
import { EntryType } from '../../../features/entries/EntryType.js'

const raw = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:task', 'SUMMARY:Updated', 'DTSTART:20261014T163000Z', 'DTEND:20261014T170000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')

describe('CalDAV calendar-query fallback', () => {
	it('updates and removes rows after a denied delta report, then reuses the query mode', async () => {
		const source = new Source({ id: 'source', uri: 'https://calendar.example.com/events/', entryTypes: [EntryType.Event], syncState: { syncToken: 'old' } })
		const retained = new Entry({ id: 'entry', sourceId: source.id, uri: source.uri + 'task.ics', type: EntryType.Event, heading: 'Old', data: { etag: 'old' } })
		const deleted = new Entry({ id: 'deleted', sourceId: source.id, uri: source.uri + 'gone.ics', type: EntryType.Event })
		const rows = [retained, deleted]
		const removed: Array<Entry> = []
		let reports = 0
		const integration = new CalDAV()
		;(integration as any).client = Promise.resolve({
			syncCollection: () => { reports++; return Promise.resolve([{ status: 403, href: source.uri }]) },
			calendarQuery: () => Promise.resolve([{ href: retained.uri, status: 200, props: { getetag: 'new' } }]),
			fetchCalendarObjects: () => Promise.resolve([{ url: retained.uri, etag: 'new', data: raw }]),
		})
		integration.syncedEntries = () => Promise.resolve(rows)
		integration.availability = () => Promise.resolve([])
		const em = { remove: (entry: Entry) => { removed.push(entry); rows.splice(rows.indexOf(entry), 1) }, persist: () => void 0, find: () => Promise.resolve([]) } as any
		await new CalDAVSyncEngine().syncSourceEntries(integration, em, source)
		assert.equal(retained.heading, 'Updated')
		assert.equal(retained.start?.toISOString(), '2026-10-14T16:30:00.000Z')
		assert.deepEqual(removed, [deleted])
		assert.equal(source.syncState?.listingMode, 'calendar-query')
		await new CalDAVSyncEngine().syncSourceEntries(integration, em, source)
		assert.equal(reports, 1)
		assert.equal(rows.length, 1)
	})

	it('keeps rows and the old token when both listing methods fail', async () => {
		const source = new Source({ id: 'source', uri: 'https://calendar.example.com/events/', syncState: { syncToken: 'old' } })
		const retained = new Entry({ id: 'entry', sourceId: source.id, uri: source.uri + 'task.ics', type: EntryType.Event })
		const integration = new CalDAV()
		;(integration as any).client = Promise.resolve({ syncCollection: () => Promise.resolve([{ status: 403, href: source.uri }]), calendarQuery: () => Promise.reject(new Error('forbidden')) })
		integration.syncedEntries = () => Promise.resolve([retained])
		const removed: Array<Entry> = []
		const em = { remove: (entry: Entry) => removed.push(entry) } as any
		await new CalDAVSyncEngine().syncSourceEntries(integration, em, source)
		assert.deepEqual(removed, [])
		assert.equal(source.syncState?.syncToken, 'old')
		assert.equal(source.syncState?.incomplete, true)
	})
})
