import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authDb } from '../lib/auth-db'
import { testUserDb } from '../test/test-user-db'

vi.mock('../lib/jwt', () => ({
	verifyAccessToken: vi.fn(),
}))

vi.mock('../lib/user-db', () => ({
	getUserDb: vi.fn(),
	UserPrismaClient: {},
}))

const { default: settings } = await import('./settings')

function createApp() {
	const app = new Hono()
	app.route('/api/settings', settings)
	return app
}

async function authenticateRequest(userId = 'test-user-id') {
	const { verifyAccessToken } = await import('../lib/jwt')
	const { getUserDb } = await import('../lib/user-db')

	vi.mocked(verifyAccessToken).mockResolvedValueOnce({
		userId,
		email: 'test@example.com',
	})
	vi.mocked(getUserDb).mockReturnValueOnce(testUserDb as never)
}

describe('Settings Routes', () => {
	let app: ReturnType<typeof createApp>
	let testUserId: string

	beforeEach(async () => {
		app = createApp()
		vi.restoreAllMocks()

		// Create a test user in the auth database
		const user = await authDb.user.create({
			data: {
				email: 'test@example.com',
				name: 'Test User',
			},
		})
		testUserId = user.id
	})

	describe('PUT /api/settings/box-token', () => {
		it('returns 401 when no auth token is provided', async () => {
			const res = await app.request('/api/settings/box-token', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: 'my-token' }),
			})
			expect(res.status).toBe(401)
		})

		it('returns 400 when token is missing from body', async () => {
			await authenticateRequest(testUserId)

			const res = await app.request('/api/settings/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}),
			})
			expect(res.status).toBe(400)

			const body = (await res.json()) as { success: boolean; error: string }
			expect(body.success).toBe(false)
		})

		it('returns 400 when token is an empty string', async () => {
			await authenticateRequest(testUserId)

			const res = await app.request('/api/settings/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token: '' }),
			})
			expect(res.status).toBe(400)
		})

		it('saves the token successfully', async () => {
			await authenticateRequest(testUserId)

			const res = await app.request('/api/settings/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token: 'my-box-api-token' }),
			})
			expect(res.status).toBe(200)

			const body = (await res.json()) as { success: boolean }
			expect(body.success).toBe(true)

			// Verify it was saved in the database
			const user = await authDb.user.findUnique({
				where: { id: testUserId },
				select: { boxApiToken: true },
			})
			expect(user?.boxApiToken).toBe('my-box-api-token')
		})
	})

	describe('GET /api/settings/box-token', () => {
		it('returns 401 when no auth token is provided', async () => {
			const res = await app.request('/api/settings/box-token')
			expect(res.status).toBe(401)
		})

		it('returns hasToken: false when no token is configured', async () => {
			await authenticateRequest(testUserId)

			const res = await app.request('/api/settings/box-token', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			expect(res.status).toBe(200)

			const body = (await res.json()) as {
				success: boolean
				data: { hasToken: boolean }
			}
			expect(body.success).toBe(true)
			expect(body.data.hasToken).toBe(false)
		})

		it('returns hasToken: true when a token is configured', async () => {
			// Set up a token in the database
			await authDb.user.update({
				where: { id: testUserId },
				data: { boxApiToken: 'some-token' },
			})

			await authenticateRequest(testUserId)

			const res = await app.request('/api/settings/box-token', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			expect(res.status).toBe(200)

			const body = (await res.json()) as {
				success: boolean
				data: { hasToken: boolean }
			}
			expect(body.success).toBe(true)
			expect(body.data.hasToken).toBe(true)
		})

		it('does not return the actual token value', async () => {
			await authDb.user.update({
				where: { id: testUserId },
				data: { boxApiToken: 'secret-token-value' },
			})

			await authenticateRequest(testUserId)

			const res = await app.request('/api/settings/box-token', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			const body = (await res.json()) as Record<string, unknown>

			// Ensure the token value is not in the response
			const bodyStr = JSON.stringify(body)
			expect(bodyStr).not.toContain('secret-token-value')
		})
	})
})
