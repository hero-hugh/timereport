import { beforeEach, describe, expect, it } from 'vitest'
import { testUserDb } from '../test/test-user-db'
import { timeEntryService } from './time-entry.service'

// User isolation is now handled at the DB level (each user has their own DB).
// The userId parameter is kept for API compatibility but not used in queries.
const testUserId = 'test-user-id'

describe('TimeEntryService', () => {
	let testProjectId: string

	beforeEach(async () => {
		// Create test project in per-user DB (no userId needed)
		const project = await testUserDb.project.create({
			data: {
				name: 'Test Project',
				startDate: new Date('2024-01-01'),
				isActive: true,
			},
		})
		testProjectId = project.id
	})

	describe('createOrUpdateTimeEntry', () => {
		it('should create a new time entry', async () => {
			const result = await timeEntryService.createOrUpdateTimeEntry(
				testUserDb,
				testUserId,
				{
					projectId: testProjectId,
					date: '2024-01-15',
					minutes: 120,
					description: 'Worked on feature',
				},
			)

			expect(result.success).toBe(true)
			expect(result.data?.minutes).toBe(120)
			expect(result.data?.description).toBe('Worked on feature')
		})

		it('should update existing entry for same project/date', async () => {
			// Skapa första entry
			await timeEntryService.createOrUpdateTimeEntry(testUserDb, testUserId, {
				projectId: testProjectId,
				date: '2024-01-15',
				minutes: 60,
			})

			// Uppdatera med ny tid
			const result = await timeEntryService.createOrUpdateTimeEntry(
				testUserDb,
				testUserId,
				{
					projectId: testProjectId,
					date: '2024-01-15',
					minutes: 120,
					description: 'Updated',
				},
			)

			expect(result.success).toBe(true)
			expect(result.data?.minutes).toBe(120)

			// Verifiera att det bara finns en entry
			const entries = await testUserDb.timeEntry.findMany({
				where: { projectId: testProjectId },
			})
			expect(entries).toHaveLength(1)
		})

		it('should return error for inactive project', async () => {
			await testUserDb.project.update({
				where: { id: testProjectId },
				data: { isActive: false },
			})

			const result = await timeEntryService.createOrUpdateTimeEntry(
				testUserDb,
				testUserId,
				{
					projectId: testProjectId,
					date: '2024-01-15',
					minutes: 60,
				},
			)

			expect(result.success).toBe(false)
			expect(result.error).toContain('inaktivt')
		})

		it('should return error for non-existent project', async () => {
			const result = await timeEntryService.createOrUpdateTimeEntry(
				testUserDb,
				testUserId,
				{
					projectId: 'non-existent-id',
					date: '2024-01-15',
					minutes: 60,
				},
			)

			expect(result.success).toBe(false)
		})
	})

	describe('getTimeEntries', () => {
		beforeEach(async () => {
			// Skapa flera tidrapporter
			await testUserDb.timeEntry.createMany({
				data: [
					{
						projectId: testProjectId,
						date: new Date('2024-01-10'),
						minutes: 60,
					},
					{
						projectId: testProjectId,
						date: new Date('2024-01-15'),
						minutes: 120,
					},
					{
						projectId: testProjectId,
						date: new Date('2024-01-20'),
						minutes: 90,
					},
				],
			})
		})

		it('should return all entries', async () => {
			const entries = await timeEntryService.getTimeEntries(
				testUserDb,
				testUserId,
				{},
			)
			expect(entries).toHaveLength(3)
		})

		it('should filter by date range', async () => {
			const entries = await timeEntryService.getTimeEntries(
				testUserDb,
				testUserId,
				{
					from: '2024-01-12',
					to: '2024-01-18',
				},
			)
			expect(entries).toHaveLength(1)
			expect(entries[0].minutes).toBe(120)
		})

		it('should filter by projectId', async () => {
			// Skapa annat projekt med tidrapport
			const otherProject = await testUserDb.project.create({
				data: {
					name: 'Other Project',
					startDate: new Date('2024-01-01'),
					isActive: true,
				},
			})

			await testUserDb.timeEntry.create({
				data: {
					projectId: otherProject.id,
					date: new Date('2024-01-15'),
					minutes: 30,
				},
			})

			const entries = await timeEntryService.getTimeEntries(
				testUserDb,
				testUserId,
				{
					projectId: testProjectId,
				},
			)

			expect(entries).toHaveLength(3)
			expect(entries.every((e) => e.projectId === testProjectId)).toBe(true)
		})

		it('should include project info', async () => {
			const entries = await timeEntryService.getTimeEntries(
				testUserDb,
				testUserId,
				{},
			)

			expect(entries[0].project).toBeDefined()
			expect(entries[0].project.name).toBe('Test Project')
		})
	})

	describe('getWeekEntries', () => {
		it('should return entries for the week', async () => {
			// Måndag 2024-01-15 till söndag 2024-01-21
			await testUserDb.timeEntry.createMany({
				data: [
					{
						projectId: testProjectId,
						date: new Date('2024-01-15'), // Måndag
						minutes: 60,
					},
					{
						projectId: testProjectId,
						date: new Date('2024-01-17'), // Onsdag
						minutes: 120,
					},
					{
						projectId: testProjectId,
						date: new Date('2024-01-22'), // Nästa måndag - utanför
						minutes: 90,
					},
				],
			})

			const weekStart = new Date('2024-01-15')
			const entries = await timeEntryService.getWeekEntries(
				testUserDb,
				testUserId,
				weekStart,
			)

			expect(entries).toHaveLength(2)
		})
	})

	describe('deleteTimeEntry', () => {
		it('should delete entry', async () => {
			const entry = await testUserDb.timeEntry.create({
				data: {
					projectId: testProjectId,
					date: new Date('2024-01-15'),
					minutes: 60,
				},
			})

			const result = await timeEntryService.deleteTimeEntry(
				testUserDb,
				entry.id,
				testUserId,
			)
			expect(result).toBe(true)

			const deleted = await testUserDb.timeEntry.findUnique({
				where: { id: entry.id },
			})
			expect(deleted).toBeNull()
		})

		it('should return false for non-existent entry', async () => {
			const result = await timeEntryService.deleteTimeEntry(
				testUserDb,
				'non-existent-id',
				testUserId,
			)
			expect(result).toBe(false)
		})
	})
})
