import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
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

			const otpCode = await db.otpCode.findFirst({
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

			const otpCodes = await db.otpCode.findMany({
				where: { email: 'test@example.com' },
			})

			// Bör finnas 2 koder, den första markerad som använd
			expect(otpCodes).toHaveLength(2)
			const unusedCodes = otpCodes.filter((c) => !c.used)
			expect(unusedCodes).toHaveLength(1)
		})

		it('should normalize email to lowercase', async () => {
			await authService.requestOtp('Test@EXAMPLE.com')

			const otpCode = await db.otpCode.findFirst({
				where: { email: 'test@example.com' },
			})
			expect(otpCode).not.toBeNull()
		})
	})

	describe('verifyOtp', () => {
		it('should return error if no OTP exists', async () => {
			const result = await authService.verifyOtp('test@example.com', '123456')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Ingen aktiv kod hittades')
		})

		it('should return error for wrong code', async () => {
			// Skapa OTP manuellt för att veta koden
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await db.otpCode.create({
				data: {
					email: 'test@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			const result = await authService.verifyOtp('test@example.com', '654321')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Felaktig kod')
		})

		it('should increment attempts on wrong code', async () => {
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await db.otpCode.create({
				data: {
					email: 'test@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: getOtpExpiry(),
				},
			})

			await authService.verifyOtp('test@example.com', '654321')

			const otpCode = await db.otpCode.findFirst({
				where: { email: 'test@example.com' },
			})
			expect(otpCode?.attempts).toBe(1)
		})

		it('should create user and return tokens for correct code', async () => {
			const { createUserDatabase } = await import('../lib/user-db')
			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await db.otpCode.create({
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
			const user = await db.user.findUnique({
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
			await db.otpCode.create({
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
			const user = await db.user.findUnique({
				where: { email: 'failuser@example.com' },
			})
			expect(user).toBeNull()
		})

		it('should not create per-user DB for existing user', async () => {
			const { createUserDatabase } = await import('../lib/user-db')
			vi.mocked(createUserDatabase).mockClear()

			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')

			// Create existing user first
			await db.user.create({
				data: { email: 'existing-db@example.com' },
			})

			await db.otpCode.create({
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
			const user = await db.user.create({
				data: { email: 'existing@example.com', name: 'Existing User' },
			})

			const { hashOtpCode, getOtpExpiry } = await import('../lib/otp')
			await db.otpCode.create({
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
			expect(result.user?.name).toBe('Existing User')
		})

		it('should return error for expired OTP', async () => {
			const { hashOtpCode } = await import('../lib/otp')
			await db.otpCode.create({
				data: {
					email: 'test@example.com',
					codeHash: hashOtpCode('123456'),
					expiresAt: new Date(Date.now() - 60000), // Utgången
				},
			})

			const result = await authService.verifyOtp('test@example.com', '123456')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Koden har gått ut')
		})
	})

	describe('refreshAccessToken', () => {
		it('should return new tokens for valid refresh token', async () => {
			// Skapa användare och session
			const user = await db.user.create({
				data: { email: 'test@example.com' },
			})

			const { createRefreshToken, getRefreshTokenExpiry } = await import(
				'../lib/jwt'
			)
			const refreshToken = await createRefreshToken({
				userId: user.id,
				email: user.email,
			})

			const session = await db.session.create({
				data: {
					userId: user.id,
					refreshToken,
					expiresAt: getRefreshTokenExpiry(),
				},
			})

			const result = await authService.refreshAccessToken(refreshToken)

			expect(result.success).toBe(true)
			expect(result.accessToken).toBeDefined()
			expect(result.newRefreshToken).toBeDefined()

			// Verifiera att sessionen uppdaterades med ny refresh token
			const updatedSession = await db.session.findUnique({
				where: { id: session.id },
			})
			expect(updatedSession?.refreshToken).toBe(result.newRefreshToken)
			expect(updatedSession?.refreshToken).not.toBe(refreshToken)
		})

		it('should return error for invalid refresh token', async () => {
			const result = await authService.refreshAccessToken('invalid-token')

			expect(result.success).toBe(false)
			expect(result.error).toBe('Ogiltig refresh token')
		})
	})

	describe('logout', () => {
		it('should delete session', async () => {
			const user = await db.user.create({
				data: { email: 'test@example.com' },
			})

			const session = await db.session.create({
				data: {
					userId: user.id,
					refreshToken: 'test-refresh-token',
					expiresAt: new Date(Date.now() + 86400000),
				},
			})

			await authService.logout('test-refresh-token')

			const deletedSession = await db.session.findUnique({
				where: { id: session.id },
			})
			expect(deletedSession).toBeNull()
		})
	})
})
