import { holidaysQuerySchema } from '@time-report/shared'
import { Hono } from 'hono'
import { getHolidaysInRange, getSwedishHolidays } from '../lib/swedish-holidays'

const app = new Hono()

/**
 * GET /api/holidays
 * Get Swedish public holidays
 *
 * Query params:
 * - year: Get all holidays for a specific year (default: current year)
 * - from: Start date for range query (YYYY-MM-DD)
 * - to: End date for range query (YYYY-MM-DD)
 *
 * If from/to are provided, returns holidays in that range.
 * Otherwise returns all holidays for the specified year.
 */
app.get('/', (c) => {
	const parsed = holidaysQuerySchema.safeParse({
		year: c.req.query('year'),
		from: c.req.query('from'),
		to: c.req.query('to'),
	})

	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga parametrar',
			},
			400,
		)
	}

	const { year, from, to } = parsed.data

	// Range query
	if (from && to) {
		const holidays = getHolidaysInRange(from, to)
		return c.json({
			success: true,
			data: {
				holidays,
				period: { from, to },
			},
		})
	}

	// Year query
	const targetYear = year ?? new Date().getFullYear()
	const holidays = getSwedishHolidays(targetYear)

	return c.json({
		success: true,
		data: {
			year: targetYear,
			holidays,
		},
	})
})

export default app
