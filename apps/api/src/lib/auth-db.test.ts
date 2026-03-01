import { describe, expect, it } from 'vitest'
import { authDb } from './auth-db'

describe('auth-db', () => {
	it('should export a PrismaClient singleton', () => {
		expect(authDb).toBeDefined()
		expect(typeof authDb.user).toBe('object')
		expect(typeof authDb.otpCode).toBe('object')
		expect(typeof authDb.session).toBe('object')
	})

	it('should return the same instance on repeated imports', async () => {
		const { authDb: authDb2 } = await import('./auth-db')
		expect(authDb).toBe(authDb2)
	})
})
