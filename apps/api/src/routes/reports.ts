import { pdfReportQuerySchema, reportQuerySchema } from '@time-report/shared'
import { Hono } from 'hono'
import { authDb } from '../lib/auth-db'
import { getAuthUser, getAuthUserDb, requireAuth } from '../middleware/auth'
import type { BoxTimeReportEntry } from '../services/box.service'
import { boxService } from '../services/box.service'
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

/**
 * Convert minutes to HH:MM format
 */
export function minutesToHHMM(minutes: number): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60
	return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * POST /api/reports/send-to-box
 * Skicka tidrapport till BOX
 */
reports.post('/send-to-box', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)

	const body = await c.req.json()
	const parsed = pdfReportQuerySchema.safeParse(body)
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

	const { year, month } = parsed.data

	// 1. Get user's BOX API token
	const user = await authDb.user.findUnique({
		where: { id: userId },
		select: { boxApiToken: true },
	})

	if (!user?.boxApiToken) {
		return c.json(
			{
				success: false,
				error:
					'Ingen BOX API-token konfigurerad. Gå till API inställningar för att lägga till din token.',
			},
			400,
		)
	}

	const token = user.boxApiToken

	// 2. Find the time report for the requested month
	const timeReports = await boxService.getTimeReports(token, year, month)
	if (timeReports.length === 0) {
		return c.json(
			{
				success: false,
				error: 'Ingen tidrapport hittades i BOX för denna period.',
			},
			404,
		)
	}

	const reportId = timeReports[0].id

	// 3. Get existing entries from BOX
	const boxReport = await boxService.getSingleTimeReport(token, reportId)

	// 4. Get local time entries for the month
	const reportData = await reportService.getMonthlyReportData(userDb, userId, {
		year,
		month,
	})

	// Build a map of date -> total minutes from local entries
	const localMinutesByDate = new Map<string, number>()
	for (const entry of reportData.dailyHours) {
		localMinutesByDate.set(entry.date, entry.minutes)
	}

	// 5. Map local entries onto BOX entries
	const mappedEntries: BoxTimeReportEntry[] = boxReport.timeReportEntries.map(
		(entry) => {
			if (entry.type !== 'common') {
				return entry
			}

			const entryDate = entry.date
			const localMinutes = localMinutesByDate.get(entryDate) ?? 0
			return {
				...entry,
				hours: minutesToHHMM(localMinutes),
			}
		},
	)

	// 6. Send update to BOX
	const updatedReport = await boxService.updateTimeReport(
		token,
		reportId,
		mappedEntries,
	)

	return c.json({ success: true, data: updatedReport })
})

export default reports
