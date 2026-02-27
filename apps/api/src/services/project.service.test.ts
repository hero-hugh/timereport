import { beforeEach, describe, expect, it } from 'vitest'
import { testUserDb } from '../test/test-user-db'
import { projectService } from './project.service'

// User isolation is now handled at the DB level (each user has their own DB).
// The userId parameter is kept for API compatibility but not used in queries.
const testUserId = 'test-user-id'

describe('ProjectService', () => {
	beforeEach(async () => {
		// Per-user DB has no User model - no user setup needed
	})

	describe('createProject', () => {
		it('should create a project', async () => {
			const project = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'Test Project',
					description: 'A test project',
					hourlyRate: 85000, // 850 kr
					startDate: '2024-01-01',
				},
			)

			expect(project.name).toBe('Test Project')
			expect(project.description).toBe('A test project')
			expect(project.hourlyRate).toBe(85000)
			expect(project.isActive).toBe(true)
		})

		it('should create project without optional fields', async () => {
			const project = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'Minimal Project',
					startDate: '2024-01-01',
				},
			)

			expect(project.name).toBe('Minimal Project')
			expect(project.description).toBeNull()
			expect(project.hourlyRate).toBeNull()
			expect(project.endDate).toBeNull()
		})
	})

	describe('getProjects', () => {
		it('should return only active projects by default', async () => {
			await projectService.createProject(testUserDb, testUserId, {
				name: 'Active Project',
				startDate: '2024-01-01',
			})

			const inactiveProject = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'Inactive Project',
					startDate: '2024-01-01',
				},
			)

			await projectService.updateProject(
				testUserDb,
				inactiveProject.id,
				testUserId,
				{
					isActive: false,
				},
			)

			const projects = await projectService.getProjects(testUserDb, testUserId)

			expect(projects).toHaveLength(1)
			expect(projects[0].name).toBe('Active Project')
		})

		it('should return all projects when includeInactive is true', async () => {
			await projectService.createProject(testUserDb, testUserId, {
				name: 'Active Project',
				startDate: '2024-01-01',
			})

			const inactiveProject = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'Inactive Project',
					startDate: '2024-01-01',
				},
			)

			await projectService.updateProject(
				testUserDb,
				inactiveProject.id,
				testUserId,
				{
					isActive: false,
				},
			)

			const projects = await projectService.getProjects(
				testUserDb,
				testUserId,
				true,
			)

			expect(projects).toHaveLength(2)
		})

		it('should include totalMinutes and totalAmount in response', async () => {
			const project = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'Project with time',
					startDate: '2024-01-01',
					hourlyRate: 100000, // 1000 kr/h
				},
			)

			// Lägg till tidrapport
			await testUserDb.timeEntry.create({
				data: {
					projectId: project.id,
					date: new Date('2024-01-15'),
					minutes: 120, // 2 timmar
				},
			})

			const projects = await projectService.getProjects(testUserDb, testUserId)

			expect(projects[0].totalMinutes).toBe(120)
			expect(projects[0].totalAmount).toBe(200000) // 2h * 1000kr = 2000kr = 200000 öre
		})
	})

	describe('getProject', () => {
		it('should return null for non-existent project', async () => {
			const project = await projectService.getProject(
				testUserDb,
				'non-existent-id',
				testUserId,
			)
			expect(project).toBeNull()
		})

		it('should return project with stats', async () => {
			const created = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'My Project',
					startDate: '2024-01-01',
					hourlyRate: 50000,
				},
			)

			const project = await projectService.getProject(
				testUserDb,
				created.id,
				testUserId,
			)

			expect(project).not.toBeNull()
			expect(project?.name).toBe('My Project')
			expect(project?.totalMinutes).toBe(0)
		})
	})

	describe('updateProject', () => {
		it('should update project fields', async () => {
			const project = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'Original Name',
					startDate: '2024-01-01',
				},
			)

			const updated = await projectService.updateProject(
				testUserDb,
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
				testUserDb,
				'non-existent-id',
				testUserId,
				{ name: 'New Name' },
			)
			expect(result).toBeNull()
		})
	})

	describe('deleteProject', () => {
		it('should delete project', async () => {
			const project = await projectService.createProject(
				testUserDb,
				testUserId,
				{
					name: 'To Delete',
					startDate: '2024-01-01',
				},
			)

			const result = await projectService.deleteProject(
				testUserDb,
				project.id,
				testUserId,
			)
			expect(result).toBe(true)

			const deleted = await testUserDb.project.findUnique({
				where: { id: project.id },
			})
			expect(deleted).toBeNull()
		})

		it('should return false for non-existent project', async () => {
			const result = await projectService.deleteProject(
				testUserDb,
				'non-existent-id',
				testUserId,
			)
			expect(result).toBe(false)
		})
	})
})
