import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authDb } from '../lib/auth-db'
import * as emailLib from '../lib/email'
import { hashRefreshToken, verifyRefreshToken } from '../lib/jwt'
import { getOtpExpiry, hashOtpCode } from '../lib/otp'
import { requireAuth } from '../middleware/auth'
import { authService } from './auth.service'

vi.mock('../lib/user-db', () => ({
	createUserDatabase: vi.fn(),
	getUserDb: vi.fn(),
	disconnectAllUserDbs: vi.fn(),
}))

function required<T>(value: T | null | undefined): T {
	if (value == null) throw new Error('Missing test fixture value')
	return value
}

beforeEach(() => {
	vi.restoreAllMocks()
})

describe('AuthService', () => {
	describe('requestOtp', () => {
		it('should create an OTP code for new email', async () => {
			const result = await authService.requestOtp('test@example.com')

			expect(result.success).toBe(true)

			const otpCode = await authDb.otpCode.findFirst({
				where: { email: 'test@example.com' },
			})
			expect(otpCode).not.toBeNull()
			expect(otpCode?.used).toBe(false)
		})

		it('should invalidate old OTP codes when requesting new one', async () => {
			// Begär första koden
			await authService.requestOtp('test@example.com')

			// Begär ny kod
			await authService.requestOtp('test@example.com')

			const otpCodes = await authDb.otpCode.findMany({
				where: { email: 'test@example.com' },
			})

			// Bör finnas 2 koder, den första markerad som använd
			expect(otpCodes).toHaveLength(2)
			const unusedCodes = otpCodes.filter((c) => !c.used)
			expect(unusedCodes).toHaveLength(1)
		})

		it('should normalize email to lowercase', async () => {
			await authService.requestOtp('Test@EXAMPLE.com')

			const otpCode = await authDb.otpCode.findFirst({
				where: { email: 'test@example.com' },
			})
			expect(otpCode).not.toBeNull()
		})
	})

	describe('verifyOtp', () => {
		it('should return error if no OTP exists', async () => {
			const result = await authService.verifyOtp('test@example.com', '123456')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Ogiltig eller utgången kod')
		})

		it('should return error for wrong code', async () => {
			// Skapa OTP manuellt för att veta koden
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await authDb.otpCode.create({
				data: {
					email: 'test@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			const result = await authService.verifyOtp('test@example.com', '654321')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Ogiltig eller utgången kod')
		})

		it('should increment attempts on wrong code', async () => {
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await authDb.otpCode.create({
				data: {
					email: 'test@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			await authService.verifyOtp('test@example.com', '654321')

			const otpCode = await authDb.otpCode.findFirst({
				where: { email: 'test@example.com' },
			})
			expect(otpCode?.attempts).toBe(1)
		})

		it('should create user and return tokens for correct code', async () => {
			const { createUserDatabase } = await import('../lib/user-db')
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await authDb.otpCode.create({
				data: {
					email: 'newuser@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			const result = await authService.verifyOtp(
				'newuser@example.com',
				'123456',
			)

			expect(result.success).toBe(true)
			expect(result.accessToken).toBeDefined()
			expect(result.refreshToken).toBeDefined()
			expect(result.user?.email).toBe('newuser@example.com')

			// Verifiera att användare skapades
			const user = await authDb.user.findUnique({
				where: { email: 'newuser@example.com' },
			})
			expect(user).not.toBeNull()

			// Verify per-user database was created
			expect(createUserDatabase).toHaveBeenCalledWith(user?.id)
		})

		it('should rollback user creation if per-user DB creation fails', async () => {
			const { createUserDatabase } = await import('../lib/user-db')
			vi.mocked(createUserDatabase).mockRejectedValueOnce(
				new Error('DB creation failed'),
			)

			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await authDb.otpCode.create({
				data: {
					email: 'failuser@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			const result = await authService.verifyOtp(
				'failuser@example.com',
				'123456',
			)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Kunde inte skapa användardatabas')

			// Verify user was rolled back (deleted from central DB)
			const user = await authDb.user.findUnique({
				where: { email: 'failuser@example.com' },
			})
			expect(user).toBeNull()
		})

		it('should not create per-user DB for existing user', async () => {
			const { createUserDatabase } = await import('../lib/user-db')
			vi.mocked(createUserDatabase).mockClear()

			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')

			// Create existing user first
			await authDb.user.create({
				data: { email: 'existing-db@example.com' },
			})

			await authDb.otpCode.create({
				data: {
					email: 'existing-db@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			const result = await authService.verifyOtp(
				'existing-db@example.com',
				'123456',
			)

			expect(result.success).toBe(true)
			// createUserDatabase should NOT be called for existing users
			expect(createUserDatabase).not.toHaveBeenCalled()
		})

		it('should login existing user', async () => {
			// Skapa användare först
			const user = await authDb.user.create({
				data: {
					email: 'existing@example.com',
					firstName: 'Existing',
					lastName: 'User',
				},
			})

			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await authDb.otpCode.create({
				data: {
					email: 'existing@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			const result = await authService.verifyOtp(
				'existing@example.com',
				'123456',
			)

			expect(result.success).toBe(true)
			expect(result.user?.id).toBe(user.id)
			expect(result.user?.firstName).toBe('Existing')
		})

		it('should return error for expired OTP', async () => {
			const { hashOtpCode } = await import('../lib/otp')
			await authDb.otpCode.create({
				data: {
					email: 'test@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: new Date(Date.now() - 60000), // Utgången
				},
			})

			const result = await authService.verifyOtp('test@example.com', '123456')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Ogiltig eller utgången kod')
		})
	})

	describe('session security', () => {
		async function login(email = 'session@example.test') {
			await authDb.otpCode.create({
				data: {
					email,
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})
			const result = await authService.verifyOtp(email, '123456')
			expect(result.success).toBe(true)
			if (!result.accessToken || !result.refreshToken || !result.user)
				throw new Error('Login fixture failed')
			return {
				accessToken: result.accessToken,
				refreshToken: result.refreshToken,
				userId: result.user.id,
			}
		}

		const protectedApp = new Hono()
		protectedApp.get('/', requireAuth, (c) => c.json({ ok: true }))
		const accessStatus = async (token: string) =>
			(
				await protectedApp.request('/', {
					headers: { Authorization: `Bearer ${token}` },
				})
			).status

		it('stores only a digest and rotates to a different refresh token', async () => {
			const original = await login()
			const before = await authDb.session.findFirstOrThrow()
			expect(before.refreshTokenHash).toBe(
				hashRefreshToken(original.refreshToken),
			)
			expect(JSON.stringify(before)).not.toContain(original.refreshToken)
			const next = await authService.refreshAccessToken(original.refreshToken)
			expect(next.success).toBe(true)
			expect(next.newRefreshToken).not.toBe(original.refreshToken)
			const after = await authDb.session.findFirstOrThrow()
			expect(after.refreshTokenHash).toBe(
				hashRefreshToken(required(next.newRefreshToken)),
			)
			expect(JSON.stringify(after)).not.toContain(
				required(next.newRefreshToken),
			)
		})

		it('returns the same winning token to concurrent refresh requests', async () => {
			const original = await login()
			const alert = vi
				.spyOn(emailLib, 'sendSecurityAlertEmail')
				.mockResolvedValue(undefined)
			const results = await Promise.all(
				Array.from({ length: 8 }, () =>
					authService.refreshAccessToken(original.refreshToken),
				),
			)
			expect(results.every((r) => r.success)).toBe(true)
			expect(new Set(results.map((r) => r.newRefreshToken)).size).toBe(1)
			expect(await authDb.session.count()).toBe(1)
			expect(alert).not.toHaveBeenCalled()
			const retry = await authService.refreshAccessToken(
				required(results[0].newRefreshToken),
			)
			expect(retry.newRefreshToken).toBe(results[0].newRefreshToken)
		})

		it('reissues the current token during grace without extending its expiry', async () => {
			const original = await login()
			const next = await authService.refreshAccessToken(original.refreshToken)
			const before = await authDb.session.findFirstOrThrow()
			const retry = await authService.refreshAccessToken(original.refreshToken)
			expect(retry.success).toBe(true)
			expect(retry.newRefreshToken).toBe(next.newRefreshToken)
			expect((await authDb.session.findFirstOrThrow()).expiresAt).toEqual(
				before.expiresAt,
			)
		})

		it('revokes all sessions and existing access tokens on reuse outside grace', async () => {
			const original = await login()
			const other = await login()
			const alert = vi
				.spyOn(emailLib, 'sendSecurityAlertEmail')
				.mockResolvedValue(undefined)
			expect(await accessStatus(other.accessToken)).toBe(200)
			await authService.refreshAccessToken(original.refreshToken)
			await authDb.session.updateMany({
				where: {
					previousJti: required(await verifyRefreshToken(original.refreshToken))
						.jti,
				},
				data: { previousJtiAt: new Date(Date.now() - 60000) },
			})
			expect(
				(await authService.refreshAccessToken(original.refreshToken)).success,
			).toBe(false)
			expect(await authDb.session.count()).toBe(0)
			expect(await accessStatus(original.accessToken)).toBe(401)
			expect(await accessStatus(other.accessToken)).toBe(401)
			expect(alert).toHaveBeenCalledTimes(1)
		})

		it('logout immediately denies access and refresh, including a pre-rotation cookie', async () => {
			const original = await login()
			const next = await authService.refreshAccessToken(original.refreshToken)
			await authService.logout(original.refreshToken)
			expect(await accessStatus(original.accessToken)).toBe(401)
			expect(await accessStatus(required(next.accessToken))).toBe(401)
			expect(
				(await authService.refreshAccessToken(required(next.newRefreshToken)))
					.success,
			).toBe(false)
		})

		it('logoutAll revokes every device while preserving another user', async () => {
			const a = await login()
			const b = await login()
			const other = await login('other-session@example.test')
			await authService.logoutAll(a.userId)
			expect(await accessStatus(a.accessToken)).toBe(401)
			expect(await accessStatus(b.accessToken)).toBe(401)
			expect(await accessStatus(other.accessToken)).toBe(200)
		})

		it('does not revoke another device when a logged-out token is replayed', async () => {
			const a = await login()
			const b = await login()
			const alert = vi
				.spyOn(emailLib, 'sendSecurityAlertEmail')
				.mockResolvedValue(undefined)
			await authService.logout(a.refreshToken)
			expect(
				(await authService.refreshAccessToken(a.refreshToken)).success,
			).toBe(false)
			expect(await accessStatus(b.accessToken)).toBe(200)
			expect(alert).not.toHaveBeenCalled()
		})

		it('rejects a missing, expired or tampered session', async () => {
			expect((await authService.refreshAccessToken('invalid')).success).toBe(
				false,
			)
			const a = await login()
			await authDb.session.updateMany({
				data: { refreshTokenHash: hashRefreshToken('different') },
			})
			expect(
				(await authService.refreshAccessToken(a.refreshToken)).success,
			).toBe(false)
			await authDb.session.updateMany({
				data: { expiresAt: new Date(Date.now() - 1000) },
			})
			expect(await accessStatus(a.accessToken)).toBe(401)
			expect(
				(await authService.refreshAccessToken(a.refreshToken)).success,
			).toBe(false)
		})

		it('removes legacy plaintext sessions on upgrade but preserves new hashes', async () => {
			const a = await login()
			await authDb.session.create({
				data: {
					userId: a.userId,
					refreshTokenHash: 'legacy-plaintext-token',
					jti: 'legacy-jti',
					expiresAt: new Date(Date.now() + 86400000),
				},
			})
			await authService.revokeLegacySessions()
			await authService.revokeLegacySessions()
			expect(await authDb.session.count()).toBe(1)
			expect(await accessStatus(a.accessToken)).toBe(200)
		})
	})

	describe('OTP concurrency', () => {
		it('consumes a correct code exactly once when requests race', async () => {
			const email = 'concurrent-otp@example.test'
			await authDb.otpCode.create({
				data: {
					email,
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})
			const results = await Promise.all(
				Array.from({ length: 8 }, () => authService.verifyOtp(email, '123456')),
			)
			expect(results.filter((r) => r.success)).toHaveLength(1)
			expect(await authDb.session.count()).toBe(1)
			expect((await authService.verifyOtp(email, '123456')).success).toBe(false)
		})

		it('counts concurrent wrong guesses atomically and enforces the attempt limit', async () => {
			const email = 'concurrent-wrong@example.test'
			await authDb.otpCode.create({
				data: {
					email,
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})
			await Promise.all(
				Array.from({ length: 8 }, () => authService.verifyOtp(email, '999999')),
			)
			expect((await authDb.otpCode.findFirstOrThrow()).attempts).toBe(5)
			expect((await authService.verifyOtp(email, '123456')).success).toBe(false)
			expect(await authDb.session.count()).toBe(0)
		})
	})

	describe('verifyOtp email-bunden lockout', () => {
		it('should lock email after 10 failed attempts regardless of IP', async () => {
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')

			// Skapa 11 OTP-koder (en per försök) så att vi kan försöka gissa 11 gånger.
			// I praktiken brute-forcar en angripare via många OTP-request → verify,
			// vilket kringgår IP-rate-limit men inte e-post-lockout.
			for (let i = 0; i < 11; i++) {
				// Markera tidigare som använda, skapa ny aktiv.
				await authDb.otpCode.updateMany({
					where: { email: 'victim@example.com', used: false },
					data: { used: true },
				})
				await authDb.otpCode.create({
					data: {
						email: 'victim@example.com',
						codeHash: hashOtpCode('111111'),
						expiresAt: getOtpExpiry(),
					},
				})

				const result = await authService.verifyOtp(
					'victim@example.com',
					'999999',
				)
				expect(result.success).toBe(false)
			}

			// Skapa nu en giltig kod, försök logga in — ska fortfarande nekas p.g.a. lock.
			await authDb.otpCode.updateMany({
				where: { email: 'victim@example.com', used: false },
				data: { used: true },
			})
			await authDb.otpCode.create({
				data: {
					email: 'victim@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})
			const lockedResult = await authService.verifyOtp(
				'victim@example.com',
				'123456',
			)
			expect(lockedResult.success).toBe(false)
			expect(lockedResult.error).toBe('Ogiltig eller utgången kod')
		})
	})
})
