import { Hono } from 'hono'
import { z } from 'zod'
import { authDb } from '../lib/auth-db'
import {
	BoxApiError,
	type BoxTimeReportEntry,
	type UpdateTimeReportEntryInput,
	getSingleTimeReport,
	getTimeReports,
	updateTimeReport,
} from '../lib/box-client'
import { minutesToHHMM } from '../lib/box-mapper'
import { getAuthUser, getAuthUserDb, requireAuth } from '../middleware/auth'

function mapBoxErrorToUserMessage(error: BoxApiError): string {
	const msg = error.message
	if (msg.startsWith('Network error:')) {
		return 'Nätverksfel - försök igen'
	}
	if (msg.includes('401') || msg.includes('403')) {
		return 'BOX API token ogiltigt - kontrollera token i API inställningar'
	}
	if (msg.includes('hours') || msg.includes('Hours')) {
		return 'Ett fel uppstod med tidsformatet'
	}
	return msg || 'Kunde inte skicka till BOX'
}

const boxSync = new Hono()

boxSync.use('*', requireAuth)

const syncSchema = z.object({
	year: z.number().int().min(2000).max(2100),
	month: z.number().int().min(1).max(12),
})

/**
 * POST /api/box/sync
 * Sync time report data to BOX for a given year/month
 */
boxSync.post('/sync', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)

	const body = await c.req.json()
	const parsed = syncSchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga parametrar',
			},
			400,
		)
	}

	const { year, month } = parsed.data

	// 1. Get user's BOX API token
	const dbUser = await authDb.user.findUnique({
		where: { id: userId },
		select: { boxApiToken: true },
	})

	if (!dbUser?.boxApiToken) {
		return c.json(
			{
				success: false,
				error: 'BOX API token saknas - konfigurera i API inställningar',
			},
			400,
		)
	}

	const token = dbUser.boxApiToken

	// 2. Fetch local time entries for the month
	const monthStart = new Date(Date.UTC(year, month - 1, 1))
	const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))

	const localEntries = await userDb.timeEntry.findMany({
		where: {
			date: {
				gte: monthStart,
				lte: monthEnd,
			},
		},
		orderBy: { date: 'asc' },
	})

	// 3. Build a map of local entries by date (aggregate minutes per date)
	const localByDate = new Map<
		string,
		{ minutes: number; description: string | null }
	>()
	for (const entry of localEntries) {
		const dateStr = entry.date.toISOString().split('T')[0]
		const existing = localByDate.get(dateStr)
		if (existing) {
			existing.minutes += entry.minutes
			if (entry.description) {
				existing.description = existing.description
					? `${existing.description}, ${entry.description}`
					: entry.description
			}
		} else {
			localByDate.set(dateStr, {
				minutes: entry.minutes,
				description: entry.description,
			})
		}
	}

	// 4. Find the BOX report for this month
	let boxReports: Awaited<ReturnType<typeof getTimeReports>>
	try {
		boxReports = await getTimeReports(token, year, month)
	} catch (error) {
		if (error instanceof BoxApiError) {
			console.error('BOX API error fetching time reports:', error.message)
			return c.json(
				{ success: false, error: mapBoxErrorToUserMessage(error) },
				502,
			)
		}
		throw error
	}

	if (!boxReports.length) {
		return c.json(
			{
				success: false,
				error: 'Ingen tidrapport hittades i BOX för denna period',
			},
			404,
		)
	}

	const boxReport = boxReports[0]

	// 5. Get existing entries from the BOX report
	let fullReport: Awaited<ReturnType<typeof getSingleTimeReport>>
	try {
		fullReport = await getSingleTimeReport(token, boxReport.id)
	} catch (error) {
		if (error instanceof BoxApiError) {
			console.error('BOX API error fetching single report:', error.message)
			return c.json(
				{ success: false, error: mapBoxErrorToUserMessage(error) },
				502,
			)
		}
		throw error
	}

	// 6. Map local entries onto BOX entries
	const updatedEntries: UpdateTimeReportEntryInput[] =
		fullReport.timeReportEntries.map((boxEntry: BoxTimeReportEntry) => {
			// Leave non-common entries unchanged
			if (boxEntry.type !== 'common') {
				return {
					id: boxEntry.id,
					type: boxEntry.type,
					date: boxEntry.date,
					hours: boxEntry.hours,
					comment: boxEntry.comment,
				}
			}

			// For common entries, update hours from local data
			const localData = localByDate.get(boxEntry.date)
			if (localData) {
				return {
					id: boxEntry.id,
					type: boxEntry.type,
					date: boxEntry.date,
					hours: minutesToHHMM(localData.minutes),
					comment: localData.description ?? boxEntry.comment,
				}
			}

			// No local entry for this date - set hours to 00:00
			return {
				id: boxEntry.id,
				type: boxEntry.type,
				date: boxEntry.date,
				hours: '00:00',
				comment: boxEntry.comment,
			}
		})

	// 7. Update the BOX report
	try {
		await updateTimeReport(token, boxReport.id, updatedEntries)
	} catch (error) {
		if (error instanceof BoxApiError) {
			console.error('BOX API error updating time report:', error.message)
			return c.json(
				{ success: false, error: mapBoxErrorToUserMessage(error) },
				502,
			)
		}
		throw error
	}

	return c.json({
		success: true,
		data: { message: 'Tidrapport skickad till BOX' },
	})
})

export default boxSync
