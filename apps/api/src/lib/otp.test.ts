import { describe, expect, it } from 'vitest'
import {
	OTP_CONFIG,
	generateOtpCode,
	getOtpExpiry,
	hasExceededMaxAttempts,
	hashOtpCode,
	isOtpExpired,
	verifyOtpCode,
} from './otp'

describe('OTP utilities', () => {
	describe('generateOtpCode', () => {
		it('should generate a 6-digit code', () => {
			const code = generateOtpCode()
			expect(code).toHaveLength(6)
			expect(/^\d{6}$/.test(code)).toBe(true)
		})

		it('should generate different codes', () => {
			const codes = new Set<string>()
			for (let i = 0; i < 100; i++) {
				codes.add(generateOtpCode())
			}
			// Med 100 genererade koder bör vi ha åtminstone 90 unika
			expect(codes.size).toBeGreaterThan(90)
		})
	})

	describe('hashOtpCode', () => {
		it('should return consistent hash for same input', () => {
			const code = '123456'
			const hash1 = hashOtpCode(code)
			const hash2 = hashOtpCode(code)
			expect(hash1).toBe(hash2)
		})

		it('should return different hash for different input', () => {
			const hash1 = hashOtpCode('123456')
			const hash2 = hashOtpCode('654321')
			expect(hash1).not.toBe(hash2)
		})
	})

	describe('verifyOtpCode', () => {
		it('should return true for correct code', () => {
			const code = '123456'
			const hash = hashOtpCode(code)
			expect(verifyOtpCode(code, hash)).toBe(true)
		})

		it('should return false for incorrect code', () => {
			const hash = hashOtpCode('123456')
			expect(verifyOtpCode('654321', hash)).toBe(false)
		})
	})

	describe('getOtpExpiry', () => {
		it('should return a date in the future', () => {
			const expiry = getOtpExpiry()
			expect(expiry.getTime()).toBeGreaterThan(Date.now())
		})

		it('should be approximately 10 minutes in the future', () => {
			const expiry = getOtpExpiry()
			const expectedExpiry = Date.now() + OTP_CONFIG.expiryMinutes * 60 * 1000
			// Allow 1 second tolerance
			expect(Math.abs(expiry.getTime() - expectedExpiry)).toBeLessThan(1000)
		})
	})

	describe('isOtpExpired', () => {
		it('should return false for future date', () => {
			const futureDate = new Date(Date.now() + 60000)
			expect(isOtpExpired(futureDate)).toBe(false)
		})

		it('should return true for past date', () => {
			const pastDate = new Date(Date.now() - 60000)
			expect(isOtpExpired(pastDate)).toBe(true)
		})
	})

	describe('hasExceededMaxAttempts', () => {
		it('should return false for attempts below max', () => {
			expect(hasExceededMaxAttempts(0)).toBe(false)
			expect(hasExceededMaxAttempts(4)).toBe(false)
		})

		it('should return true for attempts at or above max', () => {
			expect(hasExceededMaxAttempts(5)).toBe(true)
			expect(hasExceededMaxAttempts(10)).toBe(true)
		})
	})
})
