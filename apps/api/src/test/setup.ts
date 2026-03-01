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

// Importera DB clients efter att env-variabler satts
const { authDb } = await import('../lib/auth-db')
const { testUserDb } = await import('./test-user-db')

beforeAll(async () => {
	// Aktivera foreign keys för SQLite
	await authDb.$executeRaw`PRAGMA foreign_keys = ON;`

	const monorepoRoot = path.resolve(apiRoot, '../..')
	const prismaBin = path.join(monorepoRoot, 'node_modules/.bin/prisma')
	const prismaCmd = fs.existsSync(prismaBin)
		? prismaBin
		: path.join(apiRoot, 'node_modules/.bin/prisma')

	// Push auth schema to test.db
	const authSchemaPath = path.join(apiRoot, 'prisma/central/schema.prisma')
	execSync(
		`"${prismaCmd}" db push --schema="${authSchemaPath}" --skip-generate --accept-data-loss`,
		{
			env: { ...process.env },
			cwd: apiRoot,
			stdio: 'pipe',
		},
	)

	// Push per-user schema to test-user.db
	const userSchemaPath = path.join(apiRoot, 'prisma/user/schema.prisma')
	execSync(
		`"${prismaCmd}" db push --schema="${userSchemaPath}" --skip-generate --accept-data-loss`,
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
	// Rensa auth test DB (respektera foreign keys)
	await authDb.session.deleteMany()
	await authDb.otpCode.deleteMany()
	await authDb.user.deleteMany()
})

afterAll(async () => {
	await testUserDb.$disconnect()
	await authDb.$disconnect()
})
