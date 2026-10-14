import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DateTime } from '@3mo/date-time'
import { CalendarPeriod } from './CalendarPeriod.js'

describe('CalendarPeriod', () => {
	const date = new DateTime('2026-08-19T10:30:00')

	it('steps by its own length', () => {
		assert.deepEqual(CalendarPeriod.of('day').step, { days: 1 })
		assert.deepEqual(CalendarPeriod.of('week').step, { weeks: 1 })
		assert.deepEqual(CalendarPeriod.of('month').step, { months: 1 })
		assert.deepEqual(CalendarPeriod.of('year').step, { years: 1 })
	})

	it('makes the day view a one-day period and the week view a week', () => {
		assert.equal(CalendarPeriod.ofView('day'), CalendarPeriod.of('day'))
		assert.equal(CalendarPeriod.ofView('week'), CalendarPeriod.of('week'))
		assert.equal(CalendarPeriod.ofView('timeline'), CalendarPeriod.of('month'))
		assert.equal(CalendarPeriod.ofView('year'), CalendarPeriod.of('year'))
		assert.equal(CalendarPeriod.ofView('table'), undefined)
	})

	it('titles a day with its weekday and full date', () => {
		const day = CalendarPeriod.of('day')
		assert.equal(day.title(date), date.format({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
		assert.notEqual(day.title(date, 'short'), day.title(date))
	})

	it('titles a week by its month, which also has a short form', () => {
		assert.equal(CalendarPeriod.of('week').title(date), CalendarPeriod.of('month').title(date))
		assert.notEqual(CalendarPeriod.of('week').title(date, 'short'), CalendarPeriod.of('week').title(date))
		assert.equal(CalendarPeriod.of('year').title(date), '2026')
	})
})
