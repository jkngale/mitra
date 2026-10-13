import { createDAVClient } from 'tsdav'

/** Connects known Google principals without RFC discovery, using tsdav's account API. */
export class CalDAVConnection {
	static async connect(parameters: Parameters<typeof createDAVClient>[0] & { principalUrl?: string }): ReturnType<typeof createDAVClient> {
		const { principalUrl, ...options } = parameters
		if (!principalUrl) {
			return createDAVClient(options)
		}
		// createDAVClient ignores principalUrl; only createAccount accepts it in this tsdav version.
		const client = await createDAVClient({ ...options, defaultAccountType: undefined })
		const account = await client.createAccount({
			account: {
				accountType: 'caldav',
				serverUrl: options.serverUrl,
				rootUrl: new URL('/', principalUrl).href,
				principalUrl,
			},
		})
		return {
			...client,
			fetchCalendars: (parameters = {}) => client.fetchCalendars({ ...parameters, account: parameters.account ?? account }),
			fetchCalendarUserAddresses: parameters => client.fetchCalendarUserAddresses({ ...parameters, account: parameters.account ?? account }),
		}
	}
}
