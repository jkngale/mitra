import { Api, apiValueConstructor } from '@a11d/api'
import { DateTimeValueConstructor as BaseDateTimeValueConstructor } from '@3mo/date-time-value-constructor'

// The library matches dates anywhere in a string, corrupting metadata or prose containing an ISO timestamp.
for (const constructor of Api.valueConstructors) {
	if (constructor instanceof BaseDateTimeValueConstructor) {
		Api.valueConstructors.delete(constructor)
	}
}

@apiValueConstructor()
export class DateTimeValueConstructor extends BaseDateTimeValueConstructor {
	override shallConstruct = (value: unknown) => typeof value === 'string'
		&& /^\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:[+-][0-2]\d:[0-5]\d|Z)$/.test(value)
}
