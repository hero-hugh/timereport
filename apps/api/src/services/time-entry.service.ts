import type {
	CreateTimeEntryInput,
	TimeEntriesQuery,
	UpdateTimeEntryInput,
} from '@time-report/shared'
import { db } from '../lib/db'

export class TimeEntryService {
	/**
	 * Hämta tidrapporter med filter
	 */
	async getTimeEntries(userId: string, query: TimeEntriesQuery) {
		const where: {
			userId: string
			projectId?: string
			date?: { gte?: Date; lte?: Date }
		} = { userId }

		if (query.projectId) {
			where.projectId = query.projectId
		}

		if (query.from || query.to) {
			where.date = {}
			if (query.from) {
				where.date.gte = new Date(query.from)
			}
			if (query.to) {
				where.date.lte = new Date(query.to)
			}
		}

		return db.timeEntry.findMany({
			where,
			include: {
				project: {
					select: {
						id: true,
						name: true,
						hourlyRate: true,
					},
				},
			},
			orderBy: { date: 'desc' },
		})
	}

	/**
	 * Hämta tidrapport per ID
	 */
	async getTimeEntry(entryId: string, userId: string) {
		return db.timeEntry.findFirst({
			where: { id: entryId, userId },
			include: {
				project: {
					select: {
						id: true,
						name: true,
						hourlyRate: true,
					},
				},
			},
		})
	}

	/**
	 * Skapa eller uppdatera tidrapport (upsert baserat på projekt + datum)
	 */
	async createOrUpdateTimeEntry(userId: string, data: CreateTimeEntryInput) {
		// Verifiera att projektet tillhör användaren och är aktivt
		const project = await db.project.findFirst({
			where: {
				id: data.projectId,
				userId,
				isActive: true,
			},
		})

		if (!project) {
			return {
				success: false,
				error: 'Projektet hittades inte eller är inaktivt',
			}
		}

		// Parse date as UTC to avoid timezone issues
		const date = new Date(`${data.date}T00:00:00.000Z`)
		console.log(
			`[TIME-ENTRY] Creating/updating entry: projectId=${data.projectId}, date=${data.date}, parsed=${date.toISOString()}, minutes=${data.minutes}`,
		)

		// Upsert - skapa eller uppdatera befintlig entry
		const entry = await db.timeEntry.upsert({
			where: {
				projectId_userId_date: {
					projectId: data.projectId,
					userId,
					date,
				},
			},
			create: {
				projectId: data.projectId,
				userId,
				date,
				minutes: data.minutes,
				description: data.description,
			},
			update: {
				minutes: data.minutes,
				description: data.description,
			},
			include: {
				project: {
					select: {
						id: true,
						name: true,
						hourlyRate: true,
					},
				},
			},
		})

		return { success: true, data: entry }
	}

	/**
	 * Uppdatera tidrapport
	 */
	async updateTimeEntry(
		entryId: string,
		userId: string,
		data: UpdateTimeEntryInput,
	) {
		// Verifiera att entry tillhör användaren
		const entry = await db.timeEntry.findFirst({
			where: { id: entryId, userId },
		})

		if (!entry) {
			return { success: false, error: 'Tidrapport hittades inte' }
		}

		const updated = await db.timeEntry.update({
			where: { id: entryId },
			data: {
				...(data.date !== undefined && { date: new Date(data.date) }),
				...(data.minutes !== undefined && { minutes: data.minutes }),
				...(data.description !== undefined && {
					description: data.description,
				}),
			},
			include: {
				project: {
					select: {
						id: true,
						name: true,
						hourlyRate: true,
					},
				},
			},
		})

		return { success: true, data: updated }
	}

	/**
	 * Ta bort tidrapport
	 */
	async deleteTimeEntry(entryId: string, userId: string) {
		const entry = await db.timeEntry.findFirst({
			where: { id: entryId, userId },
		})

		if (!entry) return false

		await db.timeEntry.delete({
			where: { id: entryId },
		})

		return true
	}

	/**
	 * Hämta tidrapporter för en vecka
	 */
	async getWeekEntries(userId: string, weekStart: Date) {
		const weekEnd = new Date(weekStart)
		weekEnd.setDate(weekEnd.getDate() + 6)
		// Set to end of day to include all entries on the last day
		weekEnd.setHours(23, 59, 59, 999)

		console.log(
			`[TIME-ENTRY] getWeekEntries: userId=${userId}, weekStart=${weekStart.toISOString()}, weekEnd=${weekEnd.toISOString()}`,
		)

		const entries = await db.timeEntry.findMany({
			where: {
				userId,
				date: {
					gte: weekStart,
					lte: weekEnd,
				},
			},
			include: {
				project: {
					select: {
						id: true,
						name: true,
						hourlyRate: true,
						isActive: true,
					},
				},
			},
			orderBy: { date: 'asc' },
		})

		console.log(`[TIME-ENTRY] Found ${entries.length} entries`)
		return entries
	}
}

export const timeEntryService = new TimeEntryService()
