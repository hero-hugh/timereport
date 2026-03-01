import { PrismaClient } from '../generated/user/index.js'

const globalForTestUserDb = globalThis as unknown as {
	__testUserDb: PrismaClient | undefined
}

/**
 * Singleton per-user PrismaClient for tests.
 * Connects to the per-user test DB (test-user.db) which uses the
 * per-user schema (Project/TimeEntry without userId).
 */
export const testUserDb =
	globalForTestUserDb.__testUserDb ??
	new PrismaClient({
		datasourceUrl: process.env.USER_DATABASE_URL,
		log: ['error'],
	})

globalForTestUserDb.__testUserDb = testUserDb
