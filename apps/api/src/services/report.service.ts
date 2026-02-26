import type { ReportQuery } from '@time-report/shared'
import { db } from '../lib/db'
import { isRedDay } from '../lib/swedish-holidays'

export class ReportService {
	/**
	 * Hämta sammanställning av tid och belopp
	 */
	async getSummary(userId: string, query: ReportQuery) {
		const fromDate = new Date(query.from)
		const toDate = new Date(query.to)

		// Bygg where-clause
		const where: {
			userId: string
			projectId?: string
			date: { gte: Date; lte: Date }
		} = {
			userId,
			date: {
				gte: fromDate,
				lte: toDate,
			},
		}

		if (query.projectId) {
			where.projectId = query.projectId
		}

		// Hämta alla tidrapporter med projektinfo
		const entries = await db.timeEntry.findMany({
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
		})

		// Gruppera per projekt
		const projectMap = new Map<
			string,
			{
				projectId: string
				projectName: string
				hourlyRate: number | null
				totalMinutes: number
			}
		>()

		for (const entry of entries) {
			const existing = projectMap.get(entry.projectId)
			if (existing) {
				existing.totalMinutes += entry.minutes
			} else {
				projectMap.set(entry.projectId, {
					projectId: entry.project.id,
					projectName: entry.project.name,
					hourlyRate: entry.project.hourlyRate,
					totalMinutes: entry.minutes,
				})
			}
		}

		// Beräkna totaler
		const projects = Array.from(projectMap.values()).map((p) => ({
			...p,
			totalAmount: p.hourlyRate
				? Math.round((p.totalMinutes / 60) * p.hourlyRate)
				: null,
		}))

		const totalMinutes = projects.reduce((sum, p) => sum + p.totalMinutes, 0)
		const totalAmount = projects.reduce(
			(sum, p) => sum + (p.totalAmount || 0),
			0,
		)

		return {
			totalMinutes,
			totalAmount,
			projects,
			period: {
				from: query.from,
				to: query.to,
			},
		}
	}

	/**
	 * Hämta översikt för dashboard
	 */
	async getDashboardStats(userId: string) {
		const now = new Date()

		// Denna vecka (måndag till söndag)
		const weekStart = new Date(now)
		const dayOfWeek = now.getDay()
		const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
		weekStart.setDate(now.getDate() + diff)
		weekStart.setHours(0, 0, 0, 0)

		const weekEnd = new Date(weekStart)
		weekEnd.setDate(weekStart.getDate() + 6)
		weekEnd.setHours(23, 59, 59, 999)

		// Denna månad
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
		const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

		// Hämta statistik
		const [weekStats, monthStats, activeProjects, recentEntries] =
			await Promise.all([
				db.timeEntry.aggregate({
					where: {
						userId,
						date: { gte: weekStart, lte: weekEnd },
					},
					_sum: { minutes: true },
				}),
				db.timeEntry.aggregate({
					where: {
						userId,
						date: { gte: monthStart, lte: monthEnd },
					},
					_sum: { minutes: true },
				}),
				db.project.count({
					where: { userId, isActive: true },
				}),
				db.timeEntry.findMany({
					where: { userId },
					include: {
						project: {
							select: { id: true, name: true },
						},
					},
					orderBy: { date: 'desc' },
					take: 5,
				}),
			])

		// Calculate total working minutes in the month (8h per working day)
		let workingDays = 0
		const cursor = new Date(monthStart)
		while (cursor <= monthEnd) {
			if (!isRedDay(cursor)) {
				workingDays++
			}
			cursor.setDate(cursor.getDate() + 1)
		}
		const monthTotalMinutes = workingDays * 8 * 60

		return {
			weekMinutes: weekStats._sum.minutes || 0,
			monthMinutes: monthStats._sum.minutes || 0,
			monthTotalMinutes,
			activeProjectsCount: activeProjects,
			recentEntries,
		}
	}
}

export const reportService = new ReportService()
