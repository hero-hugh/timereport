import { reportQuerySchema } from '@time-report/shared'
import { Hono } from 'hono'
import { getAuthUser, requireAuth } from '../middleware/auth'
import { reportService } from '../services/report.service'

const reports = new Hono()

// Alla routes kräver autentisering
reports.use('*', requireAuth)

/**
 * GET /api/reports/summary
 * Hämta sammanställning av tid och belopp
 */
reports.get('/summary', async (c) => {
	const { userId } = getAuthUser(c)

	const query = {
		projectId: c.req.query('projectId'),
		from: c.req.query('from'),
		to: c.req.query('to'),
	}

	const parsed = reportQuerySchema.safeParse(query)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga filter',
			},
			400,
		)
	}

	const summary = await reportService.getSummary(userId, parsed.data)

	return c.json({ success: true, data: summary })
})

/**
 * GET /api/reports/dashboard
 * Hämta översikt för dashboard
 */
reports.get('/dashboard', async (c) => {
	const { userId } = getAuthUser(c)

	const stats = await reportService.getDashboardStats(userId)

	return c.json({ success: true, data: stats })
})

export default reports
