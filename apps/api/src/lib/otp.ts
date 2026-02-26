import { createHash, randomInt } from 'node:crypto'

const OTP_LENGTH = 6
const OTP_EXPIRY_MINUTES = 10
const MAX_ATTEMPTS = 5

/**
 * Generera en 6-siffrig OTP-kod
 */
export function generateOtpCode(): string {
	const min = 10 ** (OTP_LENGTH - 1)
	const max = 10 ** OTP_LENGTH - 1
	return randomInt(min, max + 1).toString()
}

/**
 * Hasha OTP-kod för lagring i databas
 */
export function hashOtpCode(code: string): string {
	return createHash('sha256').update(code).digest('hex')
}

/**
 * Verifiera att en kod matchar hashen
 */
export function verifyOtpCode(code: string, hash: string): boolean {
	return hashOtpCode(code) === hash
}

/**
 * Beräkna utgångstid för OTP
 */
export function getOtpExpiry(): Date {
	return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
}

/**
 * Kontrollera om OTP har gått ut
 */
export function isOtpExpired(expiresAt: Date): boolean {
	return new Date() > expiresAt
}

/**
 * Kontrollera om max antal försök har överskridits
 */
export function hasExceededMaxAttempts(attempts: number): boolean {
	return attempts >= MAX_ATTEMPTS
}

/**
 * Skicka OTP via e-post (för tillfället: logga till konsol)
 */
export function sendOtpEmail(email: string, code: string): void {
	// TODO: Implementera riktig e-postutskickning
	console.log(`\n${'='.repeat(50)}`)
	console.log('OTP-KOD FÖR INLOGGNING')
	console.log('='.repeat(50))
	console.log(`E-post: ${email}`)
	console.log(`Kod: ${code}`)
	console.log(`Giltig i: ${OTP_EXPIRY_MINUTES} minuter`)
	console.log(`${'='.repeat(50)}\n`)
}

export const OTP_CONFIG = {
	length: OTP_LENGTH,
	expiryMinutes: OTP_EXPIRY_MINUTES,
	maxAttempts: MAX_ATTEMPTS,
} as const
