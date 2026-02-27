import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, afterEach, beforeAll } from 'vitest'

// Resolve absolute paths for test databases
const setupDir = path.dirname(new URL(import.meta.url).pathname)
const apiRoot = path.resolve(setupDir, '../..')
const testUserDbPath = path.join(apiRoot, 'test-user.db')

// Sätt test miljövariabler
process.env.DATABASE_URL = 'file:./test.db'
process.env.AUTH_DATABASE_URL = 'file:./test.db'
process.env.USER_DATABASE_URL = `file:${testUserDbPath}`
process.env.DATABASE_DIR = process.env.DATABASE_DIR || './test-data'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters'
process.env.NODE_ENV = 'test'

// Importera db efter att env-variabler satts
const { db } = await import('../lib/db')
const { testUserDb } = await import('./test-user-db')

beforeAll(async () => {
	// Aktivera foreign keys för SQLite
	await db.$executeRaw`PRAGMA foreign_keys = ON;`

	// Push per-user schema to test-user.db
	const schemaPath = path.join(apiRoot, 'prisma/user/schema.prisma')
	const monorepoRoot = path.resolve(apiRoot, '../..')
	const prismaBin = path.join(monorepoRoot, 'node_modules/.bin/prisma')
	const prismaCmd = fs.existsSync(prismaBin)
		? prismaBin
		: path.join(apiRoot, 'node_modules/.bin/prisma')

	execSync(
		`"${prismaCmd}" db push --schema="${schemaPath}" --skip-generate --accept-data-loss`,
		{
			env: { ...process.env },
			cwd: apiRoot,
			stdio: 'pipe',
		},
	)

	await testUserDb.$executeRawUnsafe('PRAGMA foreign_keys = ON;')
})

afterEach(async () => {
	// Rensa per-user test DB
	await testUserDb.timeEntry.deleteMany()
	await testUserDb.project.deleteMany()
	// Rensa auth/shared test DB (respektera foreign keys)
	await db.timeEntry.deleteMany()
	await db.session.deleteMany()
	await db.otpCode.deleteMany()
	await db.project.deleteMany()
	await db.user.deleteMany()
})

afterAll(async () => {
	await testUserDb.$disconnect()
	await db.$disconnect()
})
