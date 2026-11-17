/** Supported calendar view types in display order. */
export const calendarViews = ['day', 'week', 'month', 'year', 'timeline', 'table'] as const

export type CalendarView = typeof calendarViews[number]
