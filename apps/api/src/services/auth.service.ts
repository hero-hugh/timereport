import { db } from '../lib/db'
import {
	createAccessToken,
	createRefreshToken,
	getRefreshTokenExpiry,
	verifyRefreshToken,
} from '../lib/jwt'
import {
	generateOtpCode,
	getOtpExpiry,
	hasExceededMaxAttempts,
	hashOtpCode,
	isOtpExpired,
	sendOtpEmail,
	verifyOtpCode,
} from '../lib/otp'

export class AuthService {
	/**
	 * Begär OTP-kod för e-postadress
	 */
	async requestOtp(
		email: string,
	): Promise<{ success: boolean; error?: string }> {
		const normalizedEmail = email.toLowerCase().trim()

		// Invalidera gamla, oanvända koder för denna e-post
		await db.otpCode.updateMany({
			where: {
				email: normalizedEmail,
				used: false,
			},
			data: {
				used: true,
			},
		})

		// Generera ny kod
		const code = generateOtpCode()
		const codeHash = hashOtpCode(code)
		const expiresAt = getOtpExpiry()

		// Spara i databas
		await db.otpCode.create({
			data: {
				email: normalizedEmail,
				codeHash,
				expiresAt,
			},
		})

		// Skicka kod (loggas till konsol i dev)
		sendOtpEmail(normalizedEmail, code)

		return { success: true }
	}

	/**
	 * Verifiera OTP-kod och logga in/skapa användare
	 */
	async verifyOtp(
		email: string,
		code: string,
	): Promise<{
		success: boolean
		accessToken?: string
		refreshToken?: string
		user?: { id: string; email: string; name: string | null }
		error?: string
	}> {
		const normalizedEmail = email.toLowerCase().trim()

		console.log(`[AUTH] Verifying OTP for: "${normalizedEmail}" with code: "${code}"`)

		// Hitta senaste oanvända koden för denna e-post
		const otpRecord = await db.otpCode.findFirst({
			where: {
				email: normalizedEmail,
				used: false,
			},
			orderBy: {
				createdAt: 'desc',
			},
		})

		console.log(`[AUTH] Found OTP record:`, otpRecord ? { id: otpRecord.id, email: otpRecord.email, used: otpRecord.used, attempts: otpRecord.attempts } : 'none')

		if (!otpRecord) {
			return { success: false, error: 'Ingen aktiv kod hittades' }
		}

		// Kolla om utgången
		if (isOtpExpired(otpRecord.expiresAt)) {
			await db.otpCode.update({
				where: { id: otpRecord.id },
				data: { used: true },
			})
			return { success: false, error: 'Koden har gått ut' }
		}

		// Kolla max försök
		if (hasExceededMaxAttempts(otpRecord.attempts)) {
			await db.otpCode.update({
				where: { id: otpRecord.id },
				data: { used: true },
			})
			return { success: false, error: 'För många försök, begär en ny kod' }
		}

		// Verifiera koden
		const codeMatches = verifyOtpCode(code, otpRecord.codeHash)
		console.log(`[AUTH] Code verification: ${codeMatches ? 'MATCH' : 'NO MATCH'}`)

		if (!codeMatches) {
			await db.otpCode.update({
				where: { id: otpRecord.id },
				data: { attempts: otpRecord.attempts + 1 },
			})
			return { success: false, error: 'Felaktig kod' }
		}

		// Markera koden som använd
		await db.otpCode.update({
			where: { id: otpRecord.id },
			data: { used: true },
		})

		// Hitta eller skapa användare
		let user = await db.user.findUnique({
			where: { email: normalizedEmail },
		})

		if (!user) {
			user = await db.user.create({
				data: { email: normalizedEmail },
			})
		}

		// Skapa tokens
		const tokenPayload = { userId: user.id, email: user.email }
		const accessToken = await createAccessToken(tokenPayload)
		const refreshToken = await createRefreshToken(tokenPayload)

		// Spara refresh token i databas
		await db.session.create({
			data: {
				userId: user.id,
				refreshToken,
				expiresAt: getRefreshTokenExpiry(),
			},
		})

		return {
			success: true,
			accessToken,
			refreshToken,
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
			},
		}
	}

	/**
	 * Förnya access token med refresh token
	 */
	async refreshAccessToken(refreshToken: string): Promise<{
		success: boolean
		accessToken?: string
		newRefreshToken?: string
		error?: string
	}> {
		// Verifiera refresh token
		const payload = await verifyRefreshToken(refreshToken)
		if (!payload) {
			return { success: false, error: 'Ogiltig refresh token' }
		}

		// Hitta session i databas
		const session = await db.session.findUnique({
			where: { refreshToken },
			include: { user: true },
		})

		if (!session) {
			return { success: false, error: 'Session hittades inte' }
		}

		if (new Date() > session.expiresAt) {
			await db.session.delete({ where: { id: session.id } })
			return { success: false, error: 'Session har gått ut' }
		}

		// Refresh token rotation - skapa nya tokens
		const tokenPayload = { userId: session.userId, email: session.user.email }
		const newAccessToken = await createAccessToken(tokenPayload)
		const newRefreshToken = await createRefreshToken(tokenPayload)

		// Uppdatera session med ny refresh token
		await db.session.update({
			where: { id: session.id },
			data: {
				refreshToken: newRefreshToken,
				expiresAt: getRefreshTokenExpiry(),
			},
		})

		return {
			success: true,
			accessToken: newAccessToken,
			newRefreshToken,
		}
	}

	/**
	 * Logga ut - ta bort session
	 */
	async logout(refreshToken: string): Promise<void> {
		await db.session.deleteMany({
			where: { refreshToken },
		})
	}

	/**
	 * Logga ut från alla enheter
	 */
	async logoutAll(userId: string): Promise<void> {
		await db.session.deleteMany({
			where: { userId },
		})
	}

	/**
	 * Hämta användare med ID
	 */
	async getUserById(userId: string) {
		return db.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				email: true,
				name: true,
				createdAt: true,
				updatedAt: true,
			},
		})
	}
}

export const authService = new AuthService()
