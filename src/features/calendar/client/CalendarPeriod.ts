import { type DateTime } from '@3mo/date-time'
import { type CalendarView } from '../CalendarView.js'

export type CalendarPeriodKind = 'day' | 'week' | 'month' | 'year'

/** What a grid names in the page heading and what one step of navigation moves it by. The table lists a window instead. */
export class CalendarPeriod {
	private static readonly all = new Map<CalendarPeriodKind, CalendarPeriod>((['day', 'week', 'month', 'year'] as const).map(kind => [kind, new CalendarPeriod(kind)]))

	static of(kind: CalendarPeriodKind) {
		return CalendarPeriod.all.get(kind)!
	}

	/** The timeline steps by months; the table has no period. */
	static ofView(view: CalendarView) {
		return view === 'table' ? undefined : CalendarPeriod.of(view === 'day' || view === 'week' || view === 'year' ? view : 'month')
	}

	private constructor(readonly kind: CalendarPeriodKind) { }

	get step(): Parameters<DateTime['add']>[0] {
		switch (this.kind) {
			case 'day': return { days: 1 }
			case 'week': return { weeks: 1 }
			case 'month': return { months: 1 }
			case 'year': return { years: 1 }
		}
	}

	/** A week goes by its month, its number shown beside it; a day by its weekday and date. */
	title(date: DateTime, month: 'long' | 'short' = 'long'): string {
		if (this.kind === 'day') {
			return date.format({ weekday: month, day: 'numeric', month, year: 'numeric' })
		}
		return this.kind === 'year' ? date.format({ year: 'numeric' }) : date.format({ month, year: 'numeric' })
	}

	get previousLabel(): string {
		switch (this.kind) {
			case 'day': return t('Previous Day')
			case 'week': return t('Previous Week')
			case 'month': return t('Previous Month')
			case 'year': return t('Previous Year')
		}
	}

	get nextLabel(): string {
		switch (this.kind) {
			case 'day': return t('Next Day')
			case 'week': return t('Next Week')
			case 'month': return t('Next Month')
			case 'year': return t('Next Year')
		}
	}
}
