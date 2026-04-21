import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authDb } from '../lib/auth-db'
import { decryptSecret, encryptSecret } from '../lib/crypto'

vi.mock('../lib/jwt', () => ({
	verifyAccessToken: vi.fn(),
}))

vi.mock('../lib/user-db', () => ({
	getUserDb: vi.fn(),
	UserPrismaClient: {},
}))

const { default: user } = await import('./user')

function createApp() {
	const app = new Hono()
	app.route('/api/user', user)
	return app
}

async function authenticateRequest(userId = 'test-user-id') {
	const { verifyAccessToken } = await import('../lib/jwt')
	const { getUserDb } = await import('../lib/user-db')

	vi.mocked(verifyAccessToken).mockResolvedValueOnce({
		userId,
		email: 'test@example.com',
	})
	vi.mocked(getUserDb).mockReturnValueOnce({} as never)
}

async function createTestUser(id = 'test-user-id') {
	return authDb.user.create({
		data: { id, email: `${id}@example.com` },
	})
}

describe('User routes - BOX token', () => {
	let app: ReturnType<typeof createApp>

	beforeEach(() => {
		app = createApp()
		vi.restoreAllMocks()
	})

	describe('GET /api/user/box-token', () => {
		it('returns 401 when not authenticated', async () => {
			const res = await app.request('/api/user/box-token')
			expect(res.status).toBe(401)
		})

		it('returns hasToken: false when no token is configured', async () => {
			await createTestUser()
			await authenticateRequest()

			const res = await app.request('/api/user/box-token', {
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

		it('returns hasToken: true when token is configured', async () => {
			await authDb.user.create({
				data: {
					id: 'user-with-token',
					email: 'with-token@example.com',
					boxApiToken: encryptSecret('some-secret-token-value'),
				},
			})
			await authenticateRequest('user-with-token')

			const res = await app.request('/api/user/box-token', {
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

		it('does not expose the actual token value', async () => {
			await authDb.user.create({
				data: {
					id: 'user-secret',
					email: 'secret@example.com',
					boxApiToken: encryptSecret('super-secret-token'),
				},
			})
			await authenticateRequest('user-secret')

			const res = await app.request('/api/user/box-token', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			const text = await res.text()
			expect(text).not.toContain('super-secret-token')
		})
	})

	describe('PUT /api/user/box-token', () => {
		it('returns 401 when not authenticated', async () => {
			const res = await app.request('/api/user/box-token', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: 'test' }),
			})
			expect(res.status).toBe(401)
		})

		it('returns 400 when token is missing', async () => {
			await createTestUser()
			await authenticateRequest()

			const res = await app.request('/api/user/box-token', {
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

		it('returns 400 when token is empty string', async () => {
			await createTestUser()
			await authenticateRequest()

			const res = await app.request('/api/user/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token: '' }),
			})
			expect(res.status).toBe(400)

			const body = (await res.json()) as { success: boolean; error: string }
			expect(body.success).toBe(false)
		})

		it('returns 400 when token is too short', async () => {
			await createTestUser()
			await authenticateRequest()

			const res = await app.request('/api/user/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token: 'too-short' }),
			})
			expect(res.status).toBe(400)
		})

		it('saves token successfully and encrypts it at rest', async () => {
			await createTestUser('save-user')
			await authenticateRequest('save-user')

			const plaintext = 'my-box-api-token-that-is-long-enough'
			const res = await app.request('/api/user/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token: plaintext }),
			})
			expect(res.status).toBe(200)

			const body = (await res.json()) as {
				success: boolean
				data: { message: string }
			}
			expect(body.success).toBe(true)

			// Verify token was persisted AND encrypted (not plaintext)
			const dbUser = await authDb.user.findUnique({
				where: { id: 'save-user' },
			})
			expect(dbUser?.boxApiToken).toBeDefined()
			expect(dbUser?.boxApiToken).not.toBe(plaintext)
			expect(dbUser?.boxApiToken?.startsWith('v1:')).toBe(true)
			expect(decryptSecret(dbUser?.boxApiToken as string)).toBe(plaintext)
		})

		it('overwrites existing token', async () => {
			await authDb.user.create({
				data: {
					id: 'overwrite-user',
					email: 'overwrite@example.com',
					boxApiToken: encryptSecret('old-token-value-long'),
				},
			})
			await authenticateRequest('overwrite-user')

			const newToken = 'new-token-value-that-is-long-enough'
			const res = await app.request('/api/user/box-token', {
				method: 'PUT',
				headers: {
					Authorization: 'Bearer valid-token',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ token: newToken }),
			})
			expect(res.status).toBe(200)

			const dbUser = await authDb.user.findUnique({
				where: { id: 'overwrite-user' },
			})
			expect(decryptSecret(dbUser?.boxApiToken as string)).toBe(newToken)
		})
	})
})
