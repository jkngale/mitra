import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TodoistClient, TodoistRequestError } from './TodoistClient.js'

describe('TodoistClient', () => {
	it('paginates project lists with the v1 cursor contract', async () => {
		const requests: Array<{ url: string, authorization: string | null }> = []
		const fetcher: typeof fetch = async (input, init) => {
			const url = new URL(String(input))
			requests.push({ url: `${url.pathname}${url.search}`, authorization: new Headers(init?.headers).get('Authorization') })
			return Response.json(requests.length === 1
				? { results: [{ id: 'p1', name: 'Work' }], next_cursor: 'next' }
				: { results: [{ id: 'p2', name: 'Home' }], next_cursor: null })
		}

		const client = new TodoistClient('token-secret', fetcher)
		assert.deepEqual(await client.projects(), [{ id: 'p1', name: 'Work' }, { id: 'p2', name: 'Home' }])
		assert.deepEqual(requests.map(request => request.url), [
			'/api/v1/projects?limit=200',
			'/api/v1/projects?limit=200&cursor=next',
		])
		assert.deepEqual(requests.map(request => request.authorization), ['Bearer token-secret', 'Bearer token-secret'])
	})

	it('reads the project task list and completed tasks using v1 endpoints', async () => {
		const paths: Array<string> = []
		const fetcher: typeof fetch = async input => {
			const url = new URL(String(input))
			paths.push(`${url.pathname}${url.search}`)
			return Response.json(url.pathname.endsWith('/completed/by_completion_date')
				? { items: [{ id: 'done' }], next_cursor: null }
				: { results: [{ id: 'open' }], next_cursor: null })
		}
		const client = new TodoistClient('secret', fetcher)

		assert.deepEqual(await client.tasks('project-1'), [{ id: 'open' }])
		assert.deepEqual(await client.completedTasks('project-1', '2026-05-01', '2026-06-11'), [{ id: 'done' }])
		assert.equal(paths[0], '/api/v1/tasks?project_id=project-1&limit=200')
		assert.equal(paths[1], '/api/v1/tasks/completed/by_completion_date?since=2026-05-01&until=2026-06-11&project_id=project-1&limit=200')
	})

	it('does not leak the API token in HTTP errors', async () => {
		const client = new TodoistClient('must-not-leak', async () => new Response('forbidden', { status: 403 }))
		await assert.rejects(client.projects(), error => {
			assert.ok(error instanceof TodoistRequestError)
			assert.equal(error.status, 403)
			assert.doesNotMatch(error.message, /must-not-leak/)
			return true
		})
	})
})
