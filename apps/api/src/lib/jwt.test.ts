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
		it('should create a valid JWT token', async () => {
			const token = await createRefreshToken(testPayload)
			expect(token).toBeDefined()
			expect(typeof token).toBe('string')
			expect(token.split('.')).toHaveLength(3)
		})

		it('should create different token than access token', async () => {
			const accessToken = await createAccessToken(testPayload)
			const refreshToken = await createRefreshToken(testPayload)
			expect(accessToken).not.toBe(refreshToken)
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
			const refreshToken = await createRefreshToken(testPayload)
			const payload = await verifyAccessToken(refreshToken)
			expect(payload).toBeNull()
		})
	})

	describe('verifyRefreshToken', () => {
		it('should verify a valid refresh token', async () => {
			const token = await createRefreshToken(testPayload)
			const payload = await verifyRefreshToken(token)

			expect(payload).not.toBeNull()
			expect(payload?.userId).toBe(testPayload.userId)
			expect(payload?.email).toBe(testPayload.email)
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
})
