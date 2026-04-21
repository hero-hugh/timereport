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
			const client1 = getUserDb('test-user-1')
			const client2 = getUserDb('test-user-1')
			expect(client1).toBe(client2)
		})

		it('should return different clients for different userIds', () => {
			const client1 = getUserDb('test-user-a')
			const client2 = getUserDb('test-user-b')
			expect(client1).not.toBe(client2)
		})

		it('rejects userIds containing path separators', () => {
			expect(() => getUserDb('../../etc/passwd')).toThrow('Invalid userId')
			expect(() => getUserDb('user/../../../etc')).toThrow('Invalid userId')
			expect(() => getUserDb('user\\..\\..\\etc')).toThrow('Invalid userId')
		})

		it('rejects userIds with shell metacharacters', () => {
			expect(() => getUserDb('user;rm -rf /')).toThrow('Invalid userId')
			expect(() => getUserDb('user$(whoami)')).toThrow('Invalid userId')
			expect(() => getUserDb('user`id`')).toThrow('Invalid userId')
			expect(() => getUserDb('user|cat')).toThrow('Invalid userId')
		})

		it('rejects empty and null-byte userIds', () => {
			expect(() => getUserDb('')).toThrow('Invalid userId')
			expect(() => getUserDb('user\0null')).toThrow('Invalid userId')
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

	/**
	 * Regressionstest för IDOR (Insecure Direct Object Reference).
	 *
	 * Säkerhetsmodellen bygger på att varje user har sin egen SQLite-fil och
	 * att auth-middleware mappar userId → userDb. Om någon i framtiden tar bort
	 * per-user-isoleringen (t.ex. konsoliderar till en delad DB utan ownership-
	 * kolumner) ska detta test brytas omedelbart.
	 */
	describe('per-user isolation (IDOR guard)', () => {
		it('projects in user A are invisible to user B', async () => {
			await createUserDatabase('user-alpha-idor')
			await createUserDatabase('user-beta-idor')

			const clientA = getUserDb('user-alpha-idor')
			const clientB = getUserDb('user-beta-idor')

			const aProject = await clientA.project.create({
				data: {
					name: "Alpha's secret project",
					startDate: new Date('2024-01-01'),
				},
			})

			const inA = await clientA.project.findMany()
			const inB = await clientB.project.findMany()
			expect(inA).toHaveLength(1)
			expect(inA[0].id).toBe(aProject.id)
			expect(inB).toHaveLength(0)

			// Explicit: B cannot fetch A's project by its id either
			const stolenAttempt = await clientB.project.findUnique({
				where: { id: aProject.id },
			})
			expect(stolenAttempt).toBeNull()
		})

		it('user B cannot update or delete user A projects via known id', async () => {
			await createUserDatabase('user-a2-idor')
			await createUserDatabase('user-b2-idor')

			const clientA = getUserDb('user-a2-idor')
			const clientB = getUserDb('user-b2-idor')

			const aProject = await clientA.project.create({
				data: { name: 'A-project', startDate: new Date('2024-01-01') },
			})

			// B attempts to update A's project — Prisma throws when the row is
			// absent from B's database, which is the guarantee we rely on.
			await expect(
				clientB.project.update({
					where: { id: aProject.id },
					data: { name: 'Hacked' },
				}),
			).rejects.toThrow()

			await expect(
				clientB.project.delete({ where: { id: aProject.id } }),
			).rejects.toThrow()

			// Verify A's data is untouched
			const afterAttack = await clientA.project.findUnique({
				where: { id: aProject.id },
			})
			expect(afterAttack?.name).toBe('A-project')
		})

		it('time entries are isolated between users', async () => {
			await createUserDatabase('user-a3-idor')
			await createUserDatabase('user-b3-idor')

			const clientA = getUserDb('user-a3-idor')
			const clientB = getUserDb('user-b3-idor')

			const aProject = await clientA.project.create({
				data: { name: 'A-proj', startDate: new Date('2024-01-01') },
			})

			await clientA.timeEntry.create({
				data: {
					projectId: aProject.id,
					date: new Date('2024-01-15'),
					minutes: 120,
				},
			})

			expect(await clientA.timeEntry.count()).toBe(1)
			expect(await clientB.timeEntry.count()).toBe(0)
		})
	})
})
