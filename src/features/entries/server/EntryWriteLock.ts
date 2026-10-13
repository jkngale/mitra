import { type RequestHandler } from 'express'
import { type MikroORM } from '@mikro-orm/sqlite'
import { Integration } from '../../../integrations/Integration.js'

/** Holds the provider's sync lock before the handler reads its entries, through the final flush. */
export function withEntryWriteLock(database: MikroORM, action: RequestHandler): RequestHandler {
	return async (req, res, next) => {
		const em = database.em.fork()
		const entry = req.params.id ? await req.user.entry(em, String(req.params.id)) : undefined
		const sourceId = req.body?.sourceId || entry?.sourceId
		if (!sourceId) {
			return action(req, res, next)
		}
		const source = await req.user.source(em, sourceId)
		const integrationIds = [source.integrationId]
		if (entry && entry.sourceId !== sourceId) {
			integrationIds.push((await req.user.source(em, entry.sourceId)).integrationId)
		}
		return Integration.exclusivelyAcross(integrationIds, () => Promise.resolve(action(req, res, next)))
	}
}
