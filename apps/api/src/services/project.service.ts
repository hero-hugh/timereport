import type {
	CreateProjectInput,
	UpdateProjectInput,
} from '@time-report/shared'
import { db } from '../lib/db'
import type { UserPrismaClient } from '../lib/user-db'

export class ProjectService {
	/**
	 * Hämta alla projekt för en användare
	 */
	async getProjects(
		_userDb: UserPrismaClient,
		userId: string,
		includeInactive = false,
	) {
		const projects = await db.project.findMany({
			where: {
				userId,
				...(includeInactive ? {} : { isActive: true }),
			},
			orderBy: { createdAt: 'desc' },
		})

		// Beräkna statistik för varje projekt
		const projectsWithStats = await Promise.all(
			projects.map(async (project) => {
				const stats = await db.timeEntry.aggregate({
					where: { projectId: project.id },
					_sum: { minutes: true },
				})

				const totalMinutes = stats._sum.minutes || 0
				const totalAmount = project.hourlyRate
					? Math.round((totalMinutes / 60) * project.hourlyRate)
					: null

				return {
					...project,
					totalMinutes,
					totalAmount,
				}
			}),
		)

		return projectsWithStats
	}

	/**
	 * Hämta ett specifikt projekt
	 */
	async getProject(
		_userDb: UserPrismaClient,
		projectId: string,
		userId: string,
	) {
		const project = await db.project.findFirst({
			where: { id: projectId, userId },
		})

		if (!project) return null

		const stats = await db.timeEntry.aggregate({
			where: { projectId: project.id },
			_sum: { minutes: true },
		})

		const totalMinutes = stats._sum.minutes || 0
		const totalAmount = project.hourlyRate
			? Math.round((totalMinutes / 60) * project.hourlyRate)
			: null

		return {
			...project,
			totalMinutes,
			totalAmount,
		}
	}

	/**
	 * Skapa nytt projekt
	 */
	async createProject(
		_userDb: UserPrismaClient,
		userId: string,
		data: CreateProjectInput,
	) {
		return db.project.create({
			data: {
				userId,
				name: data.name,
				description: data.description,
				hourlyRate: data.hourlyRate,
				startDate: new Date(data.startDate),
				endDate: data.endDate ? new Date(data.endDate) : null,
			},
		})
	}

	/**
	 * Uppdatera projekt
	 */
	async updateProject(
		_userDb: UserPrismaClient,
		projectId: string,
		userId: string,
		data: UpdateProjectInput,
	) {
		// Verifiera att projektet tillhör användaren
		const project = await db.project.findFirst({
			where: { id: projectId, userId },
		})

		if (!project) return null

		return db.project.update({
			where: { id: projectId },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.description !== undefined && {
					description: data.description,
				}),
				...(data.hourlyRate !== undefined && { hourlyRate: data.hourlyRate }),
				...(data.startDate !== undefined && {
					startDate: new Date(data.startDate),
				}),
				...(data.endDate !== undefined && {
					endDate: data.endDate ? new Date(data.endDate) : null,
				}),
				...(data.isActive !== undefined && { isActive: data.isActive }),
			},
		})
	}

	/**
	 * Ta bort projekt
	 */
	async deleteProject(
		_userDb: UserPrismaClient,
		projectId: string,
		userId: string,
	) {
		// Verifiera att projektet tillhör användaren
		const project = await db.project.findFirst({
			where: { id: projectId, userId },
		})

		if (!project) return false

		await db.project.delete({
			where: { id: projectId },
		})

		return true
	}
}

export const projectService = new ProjectService()
