import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../lib/db'
import type { UserPrismaClient } from '../lib/user-db'
import { projectService } from './project.service'

// Placeholder for per-user DB client (unused in service bodies until US-005)
const userDb = db as unknown as UserPrismaClient

describe('ProjectService', () => {
	let testUserId: string

	beforeEach(async () => {
		// Skapa testanvändare
		const user = await db.user.create({
			data: { email: 'test@example.com' },
		})
		testUserId = user.id
	})

	describe('createProject', () => {
		it('should create a project', async () => {
			const project = await projectService.createProject(userDb, testUserId, {
				name: 'Test Project',
				description: 'A test project',
				hourlyRate: 85000, // 850 kr
				startDate: '2024-01-01',
			})

			expect(project.name).toBe('Test Project')
			expect(project.description).toBe('A test project')
			expect(project.hourlyRate).toBe(85000)
			expect(project.userId).toBe(testUserId)
			expect(project.isActive).toBe(true)
		})

		it('should create project without optional fields', async () => {
			const project = await projectService.createProject(userDb, testUserId, {
				name: 'Minimal Project',
				startDate: '2024-01-01',
			})

			expect(project.name).toBe('Minimal Project')
			expect(project.description).toBeNull()
			expect(project.hourlyRate).toBeNull()
			expect(project.endDate).toBeNull()
		})
	})

	describe('getProjects', () => {
		it('should return only active projects by default', async () => {
			await projectService.createProject(userDb, testUserId, {
				name: 'Active Project',
				startDate: '2024-01-01',
			})

			const inactiveProject = await projectService.createProject(
				userDb,
				testUserId,
				{
					name: 'Inactive Project',
					startDate: '2024-01-01',
				},
			)

			await projectService.updateProject(
				userDb,
				inactiveProject.id,
				testUserId,
				{
					isActive: false,
				},
			)

			const projects = await projectService.getProjects(userDb, testUserId)

			expect(projects).toHaveLength(1)
			expect(projects[0].name).toBe('Active Project')
		})

		it('should return all projects when includeInactive is true', async () => {
			await projectService.createProject(userDb, testUserId, {
				name: 'Active Project',
				startDate: '2024-01-01',
			})

			const inactiveProject = await projectService.createProject(
				userDb,
				testUserId,
				{
					name: 'Inactive Project',
					startDate: '2024-01-01',
				},
			)

			await projectService.updateProject(
				userDb,
				inactiveProject.id,
				testUserId,
				{
					isActive: false,
				},
			)

			const projects = await projectService.getProjects(
				userDb,
				testUserId,
				true,
			)

			expect(projects).toHaveLength(2)
		})

		it('should include totalMinutes and totalAmount in response', async () => {
			const project = await projectService.createProject(userDb, testUserId, {
				name: 'Project with time',
				startDate: '2024-01-01',
				hourlyRate: 100000, // 1000 kr/h
			})

			// Lägg till tidrapport
			await db.timeEntry.create({
				data: {
					projectId: project.id,
					userId: testUserId,
					date: new Date('2024-01-15'),
					minutes: 120, // 2 timmar
				},
			})

			const projects = await projectService.getProjects(userDb, testUserId)

			expect(projects[0].totalMinutes).toBe(120)
			expect(projects[0].totalAmount).toBe(200000) // 2h * 1000kr = 2000kr = 200000 öre
		})
	})

	describe('getProject', () => {
		it('should return null for non-existent project', async () => {
			const project = await projectService.getProject(
				userDb,
				'non-existent-id',
				testUserId,
			)
			expect(project).toBeNull()
		})

		it('should return null for other users project', async () => {
			const otherUser = await db.user.create({
				data: { email: 'other@example.com' },
			})

			const project = await projectService.createProject(userDb, otherUser.id, {
				name: 'Other Project',
				startDate: '2024-01-01',
			})

			const result = await projectService.getProject(
				userDb,
				project.id,
				testUserId,
			)
			expect(result).toBeNull()
		})
	})

	describe('updateProject', () => {
		it('should update project fields', async () => {
			const project = await projectService.createProject(userDb, testUserId, {
				name: 'Original Name',
				startDate: '2024-01-01',
			})

			const updated = await projectService.updateProject(
				userDb,
				project.id,
				testUserId,
				{
					name: 'Updated Name',
					hourlyRate: 75000,
				},
			)

			expect(updated?.name).toBe('Updated Name')
			expect(updated?.hourlyRate).toBe(75000)
		})

		it('should return null when updating non-existent project', async () => {
			const result = await projectService.updateProject(
				userDb,
				'non-existent-id',
				testUserId,
				{ name: 'New Name' },
			)
			expect(result).toBeNull()
		})
	})

	describe('deleteProject', () => {
		it('should delete project', async () => {
			const project = await projectService.createProject(userDb, testUserId, {
				name: 'To Delete',
				startDate: '2024-01-01',
			})

			const result = await projectService.deleteProject(
				userDb,
				project.id,
				testUserId,
			)
			expect(result).toBe(true)

			const deleted = await db.project.findUnique({
				where: { id: project.id },
			})
			expect(deleted).toBeNull()
		})

		it('should return false for non-existent project', async () => {
			const result = await projectService.deleteProject(
				userDb,
				'non-existent-id',
				testUserId,
			)
			expect(result).toBe(false)
		})
	})
})
