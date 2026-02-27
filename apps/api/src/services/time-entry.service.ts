import type {
	CreateTimeEntryInput,
	TimeEntriesQuery,
	UpdateTimeEntryInput,
} from '@time-report/shared'
import type { UserPrismaClient } from '../lib/user-db'

export class TimeEntryService {
	/**
	 * Hämta tidrapporter med filter
	 */
	async getTimeEntries(
		userDb: UserPrismaClient,
		_userId: string,
		query: TimeEntriesQuery,
	) {
		const where: {
			projectId?: string
			date?: { gte?: Date; lte?: Date }
		} = {}

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

		return userDb.timeEntry.findMany({
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
	async getTimeEntry(
		userDb: UserPrismaClient,
		entryId: string,
		_userId: string,
	) {
		return userDb.timeEntry.findFirst({
			where: { id: entryId },
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
	async createOrUpdateTimeEntry(
		userDb: UserPrismaClient,
		_userId: string,
		data: CreateTimeEntryInput,
	) {
		// Verifiera att projektet är aktivt
		const project = await userDb.project.findFirst({
			where: {
				id: data.projectId,
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
		const entry = await userDb.timeEntry.upsert({
			where: {
				projectId_date: {
					projectId: data.projectId,
					date,
				},
			},
			create: {
				projectId: data.projectId,
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
		userDb: UserPrismaClient,
		entryId: string,
		_userId: string,
		data: UpdateTimeEntryInput,
	) {
		const entry = await userDb.timeEntry.findFirst({
			where: { id: entryId },
		})

		if (!entry) {
			return { success: false, error: 'Tidrapport hittades inte' }
		}

		const updated = await userDb.timeEntry.update({
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
	async deleteTimeEntry(
		userDb: UserPrismaClient,
		entryId: string,
		_userId: string,
	) {
		const entry = await userDb.timeEntry.findFirst({
			where: { id: entryId },
		})

		if (!entry) return false

		await userDb.timeEntry.delete({
			where: { id: entryId },
		})

		return true
	}

	/**
	 * Hämta tidrapporter för en vecka
	 */
	async getWeekEntries(
		userDb: UserPrismaClient,
		_userId: string,
		weekStart: Date,
	) {
		const weekEnd = new Date(weekStart)
		weekEnd.setDate(weekEnd.getDate() + 6)
		// Set to end of day to include all entries on the last day
		weekEnd.setHours(23, 59, 59, 999)

		console.log(
			`[TIME-ENTRY] getWeekEntries: weekStart=${weekStart.toISOString()}, weekEnd=${weekEnd.toISOString()}`,
		)

		const entries = await userDb.timeEntry.findMany({
			where: {
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
