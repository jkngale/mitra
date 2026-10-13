import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CalDAV } from '../CalDAV.js'
import { CalDAVConnection } from './CalDAVConnection.js'

const principal = 'https://www.google.com/calendar/dav/organizer%40example.com/user/'
const home = 'https://www.google.com/calendar/dav/organizer%40example.com/'
const multistatus = (url: string, properties: string) => new Response(
	`<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:href>${url}</d:href><d:propstat><d:prop>${properties}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response></d:multistatus>`,
	{ status: 207, headers: { 'Content-Type': 'application/xml' } },
)

describe('CalDAV principal connection', () => {
	it('recognizes Google principals without treating generic server roots as principals', () => {
		assert.equal(new CalDAV({ uri: principal }).clientParameters.principalUrl, principal)
		const modern = 'https://apidata.googleusercontent.com/caldav/v2/organizer%40example.com/'
		assert.equal(new CalDAV({ uri: modern }).principalUrl, modern)
		assert.equal(new CalDAV({ uri: 'https://dav.example.com/remote.php/dav/' }).principalUrl, undefined)
		assert.equal(new CalDAV({ uri: 'https://www.google.com/' }).principalUrl, undefined)
	})

	it('skips well-known and current-user-principal discovery and binds the discovered home to calendar queries', async () => {
		const requests: Array<{ url: string, body: string }> = []
		const fetcher = (async (input, init) => {
			const url = String(input)
			const body = await new Request(input, init).text()
			requests.push({ url, body })
			assert.equal(init?.method, 'PROPFIND')
			assert.ok(new Headers(init?.headers).get('Authorization')?.startsWith('Basic '))
			if (url === principal) {
				return body.includes('calendar-user-address-set')
					? multistatus(principal, '<c:calendar-user-address-set><d:href>mailto:organizer@example.com</d:href></c:calendar-user-address-set>')
					: multistatus(principal, `<c:calendar-home-set><d:href>${home}</d:href></c:calendar-home-set>`)
			}
			if (url === `${home}events/`) {
				return multistatus(url, '<d:supported-report-set/>')
			}
			assert.equal(url, home, 'no discovery probes to other URLs')
			return multistatus(`${home}events/`, '<d:displayname>Calendar</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype>')
		}) as typeof fetch
		const client = await CalDAVConnection.connect({
			serverUrl: principal, principalUrl: principal, defaultAccountType: 'caldav',
			credentials: { username: 'organizer@example.com', password: 'test-password' }, fetch: fetcher,
		})
		const calendars = await client.fetchCalendars({})
		assert.equal(calendars.length, 1)
		assert.equal(calendars[0]?.url, `${home}events/`)
		const addresses = client.fetchCalendarUserAddresses as unknown as (parameters: object) => Promise<Array<string>>
		assert.deepEqual(await addresses({}), ['mailto:organizer@example.com'])
		assert.ok(requests.every(request => !request.body.includes('current-user-principal')))
	})
})
