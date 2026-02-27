import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createUserDatabase, disconnectAllUserDbs, getUserDb } from './user-db'

describe('user-db', () => {
	let tmpDir: string

	beforeAll(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-db-test-'))
		process.env.DATABASE_DIR = tmpDir
	})

	afterEach(async () => {
		await disconnectAllUserDbs()
	})

	afterAll(async () => {
		await disconnectAllUserDbs()
		// Clean up temp directory
		fs.rmSync(tmpDir, { recursive: true, force: true })
	})

	describe('getUserDb', () => {
		it('should return the same client for the same userId', () => {
			const client1 = getUserDb('user-1')
			const client2 = getUserDb('user-1')
			expect(client1).toBe(client2)
		})

		it('should return different clients for different userIds', () => {
			const client1 = getUserDb('user-a')
			const client2 = getUserDb('user-b')
			expect(client1).not.toBe(client2)
		})
	})

	describe('createUserDatabase', () => {
		it('should create a SQLite file for a new user', async () => {
			await createUserDatabase('new-user-1')

			const dbPath = path.join(tmpDir, 'new-user-1.db')
			expect(fs.existsSync(dbPath)).toBe(true)
		})

		it('should not recreate an existing database', async () => {
			await createUserDatabase('existing-user')

			const dbPath = path.join(tmpDir, 'existing-user.db')
			const stat1 = fs.statSync(dbPath)

			// Call again - should be a no-op
			await createUserDatabase('existing-user')

			const stat2 = fs.statSync(dbPath)
			expect(stat1.mtimeMs).toBe(stat2.mtimeMs)
		})

		it('should create database directory if it does not exist', async () => {
			const nestedDir = path.join(tmpDir, 'nested', 'dir')
			process.env.DATABASE_DIR = nestedDir

			await createUserDatabase('nested-user')

			expect(fs.existsSync(nestedDir)).toBe(true)
			expect(fs.existsSync(path.join(nestedDir, 'nested-user.db'))).toBe(true)

			// Restore
			process.env.DATABASE_DIR = tmpDir
		})

		it('should create a usable database with the per-user schema', async () => {
			await createUserDatabase('schema-test-user')

			const client = getUserDb('schema-test-user')

			// Should be able to create a project
			const project = await client.project.create({
				data: {
					name: 'Test Project',
					startDate: new Date('2024-01-01'),
				},
			})

			expect(project.name).toBe('Test Project')
			expect(project.id).toBeDefined()

			// Should be able to create a time entry
			const entry = await client.timeEntry.create({
				data: {
					projectId: project.id,
					date: new Date('2024-01-15'),
					minutes: 60,
				},
			})

			expect(entry.minutes).toBe(60)
		})
	})
})
