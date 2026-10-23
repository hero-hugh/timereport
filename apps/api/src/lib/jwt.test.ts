import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import {
	createAccessToken,
	createRefreshToken,
	getRefreshTokenExpiry,
	verifyAccessToken,
	verifyRefreshToken,
} from './jwt'

describe('JWT utilities', () => {
	const testPayload = {
		userId: 'test-user-id',
		sessionId: 'test-session-id',
		email: 'test@example.com',
	}

	describe('createAccessToken', () => {
		it('should create a valid JWT token', async () => {
			const token = await createAccessToken(testPayload)
			expect(token).toBeDefined()
			expect(typeof token).toBe('string')
			expect(token.split('.')).toHaveLength(3) // JWT format: header.payload.signature
		})
	})

	describe('createRefreshToken', () => {
		it('should create a valid JWT token with a jti', async () => {
			const { token, jti } = await createRefreshToken(testPayload)
			expect(token).toBeDefined()
			expect(typeof token).toBe('string')
			expect(token.split('.')).toHaveLength(3)
			expect(typeof jti).toBe('string')
			expect(jti.length).toBeGreaterThan(0)
		})

		it('should create different token than access token', async () => {
			const accessToken = await createAccessToken(testPayload)
			const { token: refreshToken } = await createRefreshToken(testPayload)
			expect(accessToken).not.toBe(refreshToken)
		})

		it('should generate a unique jti per call', async () => {
			const a = await createRefreshToken(testPayload)
			const b = await createRefreshToken(testPayload)
			expect(a.jti).not.toBe(b.jti)
		})

		it('reconstructs the same refresh token without storing the bearer token', async () => {
			const first = await createRefreshToken(testPayload)
			const reconstructed = await createRefreshToken(testPayload, {
				jti: first.jti,
				expiresAt: first.expiresAt,
			})
			expect(reconstructed.token).toBe(first.token)
		})
	})

	describe('verifyAccessToken', () => {
		it('should verify a valid access token', async () => {
			const token = await createAccessToken(testPayload)
			const payload = await verifyAccessToken(token)

			expect(payload).not.toBeNull()
			expect(payload?.userId).toBe(testPayload.userId)
			expect(payload?.email).toBe(testPayload.email)
		})

		it('should return null for invalid token', async () => {
			const payload = await verifyAccessToken('invalid-token')
			expect(payload).toBeNull()
		})

		it('should return null for refresh token', async () => {
			const { token: refreshToken } = await createRefreshToken(testPayload)
			const payload = await verifyAccessToken(refreshToken)
			expect(payload).toBeNull()
		})
	})

	describe('verifyRefreshToken', () => {
		it('should verify a valid refresh token and expose jti', async () => {
			const { token, jti } = await createRefreshToken(testPayload)
			const payload = await verifyRefreshToken(token)

			expect(payload).not.toBeNull()
			expect(payload?.userId).toBe(testPayload.userId)
			expect(payload?.email).toBe(testPayload.email)
			expect(payload?.jti).toBe(jti)
		})

		it('should return null for invalid token', async () => {
			const payload = await verifyRefreshToken('invalid-token')
			expect(payload).toBeNull()
		})

		it('should return null for access token', async () => {
			const accessToken = await createAccessToken(testPayload)
			const payload = await verifyRefreshToken(accessToken)
			expect(payload).toBeNull()
		})
	})

	describe('getRefreshTokenExpiry', () => {
		it('should return a date 7 days in the future', () => {
			const expiry = getRefreshTokenExpiry()
			const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000
			// Allow 1 second tolerance
			expect(Math.abs(expiry.getTime() - expectedExpiry)).toBeLessThan(1000)
		})
	})

	it.each(['access', 'refresh'])(
		'rejects legacy %s tokens without a session binding',
		async (kind) => {
			const secret =
				kind === 'access'
					? process.env.JWT_SECRET
					: process.env.JWT_REFRESH_SECRET
			const token = await new SignJWT({
				userId: testPayload.userId,
				email: testPayload.email,
			})
				.setProtectedHeader({ alg: 'HS256' })
				.setJti('legacy-jti')
				.setExpirationTime('15m')
				.sign(new TextEncoder().encode(secret))
			const verify = kind === 'access' ? verifyAccessToken : verifyRefreshToken
			expect(await verify(token)).toBeNull()
		},
	)

	it('rejects signed tokens without an expiry', async () => {
		const token = await new SignJWT({ ...testPayload })
			.setProtectedHeader({ alg: 'HS256' })
			.sign(new TextEncoder().encode(process.env.JWT_SECRET))
		expect(await verifyAccessToken(token)).toBeNull()
	})
})
