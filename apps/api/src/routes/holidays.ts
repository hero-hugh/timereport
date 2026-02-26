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
 * If from/to are provided, returns holidays in that range
 * Otherwise returns all holidays for the specified year
 */
app.get('/', (c) => {
	const year = c.req.query('year')
	const from = c.req.query('from')
	const to = c.req.query('to')

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
	const targetYear = year ? Number.parseInt(year, 10) : new Date().getFullYear()

	if (Number.isNaN(targetYear) || targetYear < 1900 || targetYear > 2100) {
		return c.json(
			{
				success: false,
				error: 'Ogiltigt år. Ange ett år mellan 1900 och 2100.',
			},
			400,
		)
	}

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
