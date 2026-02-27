import { afterAll, afterEach, beforeAll } from 'vitest'

// Sätt test miljövariabler
process.env.DATABASE_URL = 'file:./test.db'
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters'
process.env.NODE_ENV = 'test'

// Importera db efter att env-variabler satts
const { db } = await import('../lib/db')

beforeAll(async () => {
	// Aktivera foreign keys för SQLite
	await db.$executeRaw`PRAGMA foreign_keys = ON;`
})

afterEach(async () => {
	// Rensa tabeller efter varje test i rätt ordning (respektera foreign keys)
	await db.timeEntry.deleteMany()
	await db.session.deleteMany()
	await db.otpCode.deleteMany()
	await db.project.deleteMany()
	await db.user.deleteMany()
})

afterAll(async () => {
	await db.$disconnect()
})
