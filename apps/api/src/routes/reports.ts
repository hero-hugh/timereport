import { pdfReportQuerySchema, reportQuerySchema } from '@time-report/shared'
import { Hono } from 'hono'
import { getAuthUser, getAuthUserDb, requireAuth } from '../middleware/auth'
import { pdfService } from '../services/pdf.service'
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
	const userDb = getAuthUserDb(c)

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

	const summary = await reportService.getSummary(userDb, userId, parsed.data)

	return c.json({ success: true, data: summary })
})

/**
 * GET /api/reports/dashboard
 * Hämta översikt för dashboard
 */
reports.get('/dashboard', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)

	const stats = await reportService.getDashboardStats(userDb, userId)

	return c.json({ success: true, data: stats })
})

/**
 * GET /api/reports/pdf
 * Generera PDF-rapport för en månad
 */
reports.get('/pdf', async (c) => {
	const { userId, email } = getAuthUser(c)
	const userDb = getAuthUserDb(c)

	const query = {
		year: c.req.query('year'),
		month: c.req.query('month'),
	}

	const parsed = pdfReportQuerySchema.safeParse(query)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error:
					parsed.error.errors[0]?.message ||
					'Ogiltiga parametrar (year och month krävs)',
			},
			400,
		)
	}

	const reportData = await reportService.getMonthlyReportData(
		userDb,
		userId,
		parsed.data,
	)

	const pdfBuffer = await pdfService.generateMonthlyReport({
		email,
		year: reportData.year,
		month: reportData.month,
		dailyHours: reportData.dailyHours,
		totalMinutes: reportData.totalMinutes,
		generatedAt: new Date().toISOString().split('T')[0],
	})

	const filename = `tidrapport-${parsed.data.year}-${String(parsed.data.month).padStart(2, '0')}.pdf`

	return new Response(pdfBuffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`,
		},
	})
})

export default reports
