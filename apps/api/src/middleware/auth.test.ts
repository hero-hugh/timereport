import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import type { UserPrismaClient } from '../lib/user-db'
import { createTestSession } from '../test/session'
import { getAuthUser, getAuthUserDb, requireAuth } from './auth'

vi.mock('../lib/jwt', () => ({
	verifyAccessToken: vi.fn(),
}))

vi.mock('../lib/user-db', () => ({
	getUserDb: vi.fn(),
	UserPrismaClient: {},
}))

describe('Auth Middleware', () => {
	describe('requireAuth', () => {
		it('should return 401 when no token is provided', async () => {
			const app = new Hono()
			app.use('*', requireAuth)
			app.get('/', (c) => c.json({ ok: true }))

			const res = await app.request('/')
			expect(res.status).toBe(401)
		})

		it('should return 401 for invalid token', async () => {
			const { verifyAccessToken } = await import('../lib/jwt')
			vi.mocked(verifyAccessToken).mockResolvedValueOnce(null)

			const app = new Hono()
			app.use('*', requireAuth)
			app.get('/', (c) => c.json({ ok: true }))

			const res = await app.request('/', {
				headers: { Authorization: 'Bearer invalid-token' },
			})
			expect(res.status).toBe(401)
		})

		it('rejects a session belonging to a different user before opening a user database', async () => {
			const { verifyAccessToken } = await import('../lib/jwt')
			const { getUserDb } = await import('../lib/user-db')
			vi.mocked(getUserDb).mockClear()
			const session = await createTestSession('session-owner')
			vi.mocked(verifyAccessToken).mockResolvedValueOnce({
				userId: 'other-user',
				email: 'other@example.test',
				sessionId: session.id,
			})
			const app = new Hono().get('/', requireAuth, (c) => c.json({ ok: true }))
			expect(
				(
					await app.request('/', {
						headers: { Authorization: 'Bearer signed-token' },
					})
				).status,
			).toBe(401)
			expect(getUserDb).not.toHaveBeenCalled()
		})

		it('should set user and userDb on context for valid token', async () => {
			const { verifyAccessToken } = await import('../lib/jwt')
			const { getUserDb } = await import('../lib/user-db')

			const session = await createTestSession('user-123')
			const mockPayload = {
				userId: 'user-123',
				email: 'test@example.com',
				sessionId: session.id,
			}
			const mockUserDb = {
				project: {},
				timeEntry: {},
			} as unknown as UserPrismaClient

			vi.mocked(verifyAccessToken).mockResolvedValueOnce(mockPayload)
			vi.mocked(getUserDb).mockReturnValueOnce(mockUserDb)

			const app = new Hono()
			app.use('*', requireAuth)
			app.get('/', (c) => {
				const user = getAuthUser(c)
				const userDb = getAuthUserDb(c)
				return c.json({ user, hasUserDb: !!userDb })
			})

			const res = await app.request('/', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			expect(res.status).toBe(200)

			const body = (await res.json()) as {
				user: { userId: string; email: string }
				hasUserDb: boolean
			}
			expect(body.user).toEqual(mockPayload)
			expect(body.hasUserDb).toBe(true)
		})

		it('should resolve userDb via getUserDb with the authenticated userId', async () => {
			const { verifyAccessToken } = await import('../lib/jwt')
			const { getUserDb } = await import('../lib/user-db')

			const session = await createTestSession('user-456')
			const mockPayload = {
				userId: 'user-456',
				email: 'test@example.com',
				sessionId: session.id,
			}
			const mockUserDb = { project: {} } as unknown as UserPrismaClient

			vi.mocked(verifyAccessToken).mockResolvedValueOnce(mockPayload)
			vi.mocked(getUserDb).mockReturnValueOnce(mockUserDb)

			const app = new Hono()
			app.use('*', requireAuth)
			app.get('/', (c) => c.json({ ok: true }))

			await app.request('/', {
				headers: { Authorization: 'Bearer valid-token' },
			})

			expect(getUserDb).toHaveBeenCalledWith('user-456')
		})

		it('should read token from access_token cookie', async () => {
			const { verifyAccessToken } = await import('../lib/jwt')
			const { getUserDb } = await import('../lib/user-db')

			const session = await createTestSession('user-789')
			const mockPayload = {
				userId: 'user-789',
				email: 'test@example.com',
				sessionId: session.id,
			}
			vi.mocked(verifyAccessToken).mockResolvedValueOnce(mockPayload)
			vi.mocked(getUserDb).mockReturnValueOnce(
				{} as unknown as UserPrismaClient,
			)

			const app = new Hono()
			app.use('*', requireAuth)
			app.get('/', (c) => c.json({ ok: true }))

			const res = await app.request('/', {
				headers: { Cookie: 'access_token=cookie-token' },
			})
			expect(res.status).toBe(200)
			expect(verifyAccessToken).toHaveBeenCalledWith('cookie-token')
		})
	})
})
