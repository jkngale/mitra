import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { type Request, type Response, type RequestHandler } from 'express'
import { type MikroORM } from '@mikro-orm/sqlite'
import { Integration } from '../../../integrations/Integration.js'
import { withEntryWriteLock } from './EntryWriteLock.js'

const database = { em: { fork: () => ({}) } } as unknown as MikroORM
const request = (id: string) => ({
	params: { id: 'entry' }, body: {},
	user: { entry: () => Promise.resolve({ sourceId: 'source' }), source: () => Promise.resolve({ integrationId: id }) },
}) as unknown as Request

describe('entry writes and background sync', () => {
	it('reads the mutation snapshot only after an in-flight sync has flushed', async () => {
		const id = crypto.randomUUID()
		const gate = Promise.withResolvers<void>()
		const started = Promise.withResolvers<void>()
		let date = 'yesterday'
		const sync = Integration.exclusively(id, async () => { started.resolve(); await gate.promise; date = 'today' })
		await started.promise
		let read: string | undefined
		const write = withEntryWriteLock(database, (() => { read = date; date = 'tomorrow' }) as RequestHandler)(request(id), {} as Response, () => void 0)
		assert.equal(read, undefined)
		gate.resolve()
		await Promise.all([sync, write])
		assert.equal(read, 'today')
		assert.equal(date, 'tomorrow')
	})

	it('holds the lock through the mutation flush, so a later sync cannot take the old schedule', async () => {
		const id = crypto.randomUUID()
		const gate = Promise.withResolvers<void>()
		const started = Promise.withResolvers<void>()
		let date = 'yesterday'
		const write = withEntryWriteLock(database, (async () => { started.resolve(); await gate.promise; date = 'tomorrow' }) as RequestHandler)(request(id), {} as Response, () => void 0)
		await started.promise
		let read: string | undefined
		const sync = Integration.exclusively(id, () => { read = date; return Promise.resolve() })
		assert.equal(read, undefined)
		gate.resolve()
		await Promise.all([write, sync])
		assert.equal(read, 'tomorrow')
	})
})
