import type {
	CreateProjectInput,
	UpdateProjectInput,
} from '@time-report/shared'
import type { UserPrismaClient } from '../lib/user-db'

export class ProjectService {
	/**
	 * Hämta alla projekt för en användare
	 */
	async getProjects(
		userDb: UserPrismaClient,
		_userId: string,
		includeInactive = false,
	) {
		const projects = await userDb.project.findMany({
			where: {
				...(includeInactive ? {} : { isActive: true }),
			},
			orderBy: { createdAt: 'desc' },
		})

		// Beräkna statistik för varje projekt
		const projectsWithStats = await Promise.all(
			projects.map(async (project) => {
				const stats = await userDb.timeEntry.aggregate({
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
		userDb: UserPrismaClient,
		projectId: string,
		_userId: string,
	) {
		const project = await userDb.project.findFirst({
			where: { id: projectId },
		})

		if (!project) return null

		const stats = await userDb.timeEntry.aggregate({
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
		userDb: UserPrismaClient,
		_userId: string,
		data: CreateProjectInput,
	) {
		return userDb.project.create({
			data: {
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
		userDb: UserPrismaClient,
		projectId: string,
		_userId: string,
		data: UpdateProjectInput,
	) {
		const project = await userDb.project.findFirst({
			where: { id: projectId },
		})

		if (!project) return null

		return userDb.project.update({
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
		userDb: UserPrismaClient,
		projectId: string,
		_userId: string,
	) {
		const project = await userDb.project.findFirst({
			where: { id: projectId },
		})

		if (!project) return false

		await userDb.project.delete({
			where: { id: projectId },
		})

		return true
	}
}

export const projectService = new ProjectService()
