import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { authDb } from '../lib/auth-db'
import { getOtpExpiry, hashOtpCode } from '../lib/otp'
import auth from './auth'

vi.mock('../lib/user-db', () => ({
	createUserDatabase: vi.fn(),
	getUserDb: vi.fn(),
}))

const app = new Hono().route('/api/auth', auth)

async function login(email: string) {
	await authDb.otpCode.create({
		data: { email, codeHash: hashOtpCode('123456'), expiresAt: getOtpExpiry() },
	})
	const response = await app.request('/api/auth/verify-otp', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, code: '123456' }),
	})
	expect(response.status).toBe(200)
	const cookies = response.headers.getSetCookie()
	expect(cookies).toHaveLength(2)
	for (const cookie of cookies) {
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('SameSite=Strict')
	}
	return cookies.map((cookie) => cookie.split(';')[0]).join('; ')
}

describe('session revocation routes', () => {
	it('requires authentication to revoke all sessions', async () => {
		const cookie = await login('auth-route@example.test')
		expect(
			(await app.request('/api/auth/logout-all', { method: 'POST' })).status,
		).toBe(401)
		expect(
			(await app.request('/api/auth/me', { headers: { cookie } })).status,
		).toBe(200)
	})

	it('revokes all own devices and clears cookies without affecting another user', async () => {
		const first = await login('all-devices@example.test')
		const second = await login('all-devices@example.test')
		const other = await login('other-user@example.test')
		const response = await app.request('/api/auth/logout-all', {
			method: 'POST',
			headers: { cookie: first },
		})
		expect(response.status).toBe(200)
		for (const cookie of response.headers.getSetCookie())
			expect(cookie).toContain('Max-Age=0')
		for (const cookie of [first, second]) {
			expect(
				(await app.request('/api/auth/me', { headers: { cookie } })).status,
			).toBe(401)
			expect(
				(
					await app.request('/api/auth/refresh', {
						method: 'POST',
						headers: { cookie },
					})
				).status,
			).toBe(401)
		}
		expect(
			(await app.request('/api/auth/me', { headers: { cookie: other } }))
				.status,
		).toBe(200)
	})

	it('logout immediately blocks the original access cookie', async () => {
		const cookie = await login('logout-route@example.test')
		expect(
			(
				await app.request('/api/auth/logout', {
					method: 'POST',
					headers: { cookie },
				})
			).status,
		).toBe(200)
		expect(
			(await app.request('/api/auth/me', { headers: { cookie } })).status,
		).toBe(401)
	})
})
