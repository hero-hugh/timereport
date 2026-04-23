import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authDb } from '../lib/auth-db'
import { authService } from './auth.service'

vi.mock('../lib/user-db', () => ({
	createUserDatabase: vi.fn(),
	getUserDb: vi.fn(),
	disconnectAllUserDbs: vi.fn(),
}))

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

	describe('refreshAccessToken', () => {
		it('should return new tokens for valid refresh token', async () => {
			// Skapa användare och session
			const user = await authDb.user.create({
				data: { email: 'test@example.com' },
			})

			const { createRefreshToken, getRefreshTokenExpiry } = await import(
				'../lib/jwt'
			)
			const { token: refreshToken, jti } = await createRefreshToken({
				userId: user.id,
				email: user.email,
			})

			const session = await authDb.session.create({
				data: {
					userId: user.id,
					refreshToken,
					jti,
					expiresAt: getRefreshTokenExpiry(),
				},
			})

			const result = await authService.refreshAccessToken(refreshToken)

			expect(result.success).toBe(true)
			expect(result.accessToken).toBeDefined()
			expect(result.newRefreshToken).toBeDefined()

			// Verifiera att sessionen uppdaterades med ny refresh token
			const updatedSession = await authDb.session.findUnique({
				where: { id: session.id },
			})
			expect(updatedSession?.refreshToken).toBe(result.newRefreshToken)
			expect(updatedSession?.refreshToken).not.toBe(refreshToken)
			expect(updatedSession?.jti).not.toBe(jti)
		})

		it('should return error for invalid refresh token', async () => {
			const result = await authService.refreshAccessToken('invalid-token')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Ogiltig refresh token')
		})

		it('should invalidate all sessions on refresh token reuse', async () => {
			const user = await authDb.user.create({
				data: { email: 'reuse@example.com' },
			})

			const { createRefreshToken, getRefreshTokenExpiry } = await import(
				'../lib/jwt'
			)
			// Session A — kommer roteras först, gamla token försöker sedan reuse.
			const { token: tokenA, jti: jtiA } = await createRefreshToken({
				userId: user.id,
				email: user.email,
			})
			await authDb.session.create({
				data: {
					userId: user.id,
					refreshToken: tokenA,
					jti: jtiA,
					expiresAt: getRefreshTokenExpiry(),
				},
			})
			// Session B — separat enhet, ska också invalideras när reuse sker.
			const { token: tokenB, jti: jtiB } = await createRefreshToken({
				userId: user.id,
				email: user.email,
			})
			await authDb.session.create({
				data: {
					userId: user.id,
					refreshToken: tokenB,
					jti: jtiB,
					expiresAt: getRefreshTokenExpiry(),
				},
			})

			// Legit rotation av session A
			const rotated = await authService.refreshAccessToken(tokenA)
			expect(rotated.success).toBe(true)

			// Nu presenteras gamla tokenA igen — simulerad reuse
			const reuseAttempt = await authService.refreshAccessToken(tokenA)
			expect(reuseAttempt.success).toBe(false)

			// Alla sessioner för användaren ska ha raderats
			const remaining = await authDb.session.findMany({
				where: { userId: user.id },
			})
			expect(remaining).toHaveLength(0)
		})
	})

	describe('logout', () => {
		it('should delete session', async () => {
			const user = await authDb.user.create({
				data: { email: 'test@example.com' },
			})

			const session = await authDb.session.create({
				data: {
					userId: user.id,
					refreshToken: 'test-refresh-token',
					jti: 'test-jti-logout',
					expiresAt: new Date(Date.now() + 86400000),
				},
			})

			await authService.logout('test-refresh-token')

			const deletedSession = await authDb.session.findUnique({
				where: { id: session.id },
			})
			expect(deletedSession).toBeNull()
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
