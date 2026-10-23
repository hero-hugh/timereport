import { randomUUID } from 'node:crypto'
import { authDb } from '../lib/auth-db'
import { secureStringEquals } from '../lib/crypto'
import { sendSecurityAlertEmail } from '../lib/email'
import {
	createAccessToken,
	createRefreshToken,
	hashRefreshToken,
	verifyRefreshToken,
} from '../lib/jwt'
import {
	OTP_CONFIG,
	generateOtpCode,
	getOtpExpiry,
	hasExceededMaxAttempts,
	hashOtpCode,
	isOtpExpired,
	sendOtpEmail,
	verifyOtpCode,
} from '../lib/otp'
import { createUserDatabase } from '../lib/user-db'

// In-memory counter för misslyckade OTP-verifieringar per e-post. Skyddar mot
// distribuerade brute force-angrepp som roterar IP — IP-bunden rate limit i
// routes/auth.ts räcker inte mot 1000+ residential proxies. Counter nollställs
// vid API-restart; acceptabelt givet single-instance-deploy (CapRover). Om
// appen skalas horisontellt måste detta flyttas till DB/Redis.
const failedByEmail = new Map<string, { count: number; lockedUntil: number }>()
const MAX_EMAIL_FAILURES = 10
const EMAIL_LOCK_MS = 30 * 60 * 1000 // 30 min

// Tolerera replay av en alldeles nyss roterad refresh token inom detta
// fönster — det är concurrent /refresh från parallella API-anrop, inte
// ett angrepp. Utanför fönstret behandlas det som äkta token-reuse.
const REFRESH_GRACE_WINDOW_MS = 30 * 1000

function isEmailLocked(email: string): boolean {
	const entry = failedByEmail.get(email)
	if (!entry) return false
	// Nollställ endast om en låsning faktiskt satts och den har löpt ut.
	// Utan denna guard tolkas en fresh entry (lockedUntil=0) som "lock
	// expired" eftersom Date.now() alltid är > 0.
	if (entry.lockedUntil > 0 && Date.now() >= entry.lockedUntil) {
		failedByEmail.delete(email)
		return false
	}
	return entry.count >= MAX_EMAIL_FAILURES
}

function clearEmailFailures(email: string): void {
	failedByEmail.delete(email)
}

async function recordEmailFailure(email: string): Promise<void> {
	const entry = failedByEmail.get(email) ?? { count: 0, lockedUntil: 0 }
	entry.count += 1
	failedByEmail.set(email, entry)
	if (entry.count === MAX_EMAIL_FAILURES) {
		entry.lockedUntil = Date.now() + EMAIL_LOCK_MS
		// Lås → meddela användaren. Bäst-ansträngning, fortsätt oavsett resultat.
		await sendSecurityAlertEmail(
			email,
			'Någon har försökt logga in på ditt konto med fel kod flera gånger. Inloggningen är tillfälligt pausad i 30 minuter.',
		).catch(() => undefined)
	}
}

export class AuthService {
	/**
	 * Begär OTP-kod för e-postadress
	 */
	async requestOtp(
		email: string,
	): Promise<{ success: boolean; error?: string }> {
		const normalizedEmail = email.toLowerCase().trim()

		// Invalidera gamla, oanvända koder för denna e-post
		await authDb.otpCode.updateMany({
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
		await authDb.otpCode.create({
			data: {
				email: normalizedEmail,
				codeHash,
				expiresAt,
			},
		})

		// Skicka kod via e-post (loggas till konsol i dev)
		await sendOtpEmail(normalizedEmail, code)

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
		user?: {
			id: string
			email: string
			firstName: string | null
			lastName: string | null
		}
		error?: string
	}> {
		const normalizedEmail = email.toLowerCase().trim()

		// E-post-bunden brute force-check: oberoende av IP, blockerar
		// distribuerade attacker. Samma svar som för fel kod så att en
		// angripare inte kan avgöra om ett konto är låst.
		if (isEmailLocked(normalizedEmail)) {
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Hitta senaste oanvända koden för denna e-post
		const otpRecord = await authDb.otpCode.findFirst({
			where: {
				email: normalizedEmail,
				used: false,
			},
			orderBy: {
				createdAt: 'desc',
			},
		})

		if (!otpRecord) {
			await recordEmailFailure(normalizedEmail)
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Kolla om utgången
		if (isOtpExpired(otpRecord.expiresAt)) {
			await authDb.otpCode.update({
				where: { id: otpRecord.id },
				data: { used: true },
			})
			await recordEmailFailure(normalizedEmail)
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Kolla max försök
		if (hasExceededMaxAttempts(otpRecord.attempts)) {
			await authDb.otpCode.update({
				where: { id: otpRecord.id },
				data: { used: true },
			})
			await recordEmailFailure(normalizedEmail)
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Verifiera koden
		const codeMatches = verifyOtpCode(code, otpRecord.codeHash)

		if (!codeMatches) {
			await authDb.otpCode.updateMany({
				where: {
					id: otpRecord.id,
					used: false,
					attempts: { lt: OTP_CONFIG.maxAttempts },
					expiresAt: { gt: new Date() },
				},
				data: { attempts: { increment: 1 } },
			})
			await recordEmailFailure(normalizedEmail)
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Only one request may consume the code, even when verification races.
		const consumed = await authDb.otpCode.updateMany({
			where: {
				id: otpRecord.id,
				used: false,
				attempts: { lt: OTP_CONFIG.maxAttempts },
				expiresAt: { gt: new Date() },
			},
			data: { used: true },
		})
		if (consumed.count !== 1) {
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Lyckad inloggning — rensa misslyckade försök för denna e-post.
		clearEmailFailures(normalizedEmail)

		// Hitta eller skapa användare
		let user = await authDb.user.findUnique({
			where: { email: normalizedEmail },
		})

		if (!user) {
			user = await authDb.user.create({
				data: { email: normalizedEmail },
			})

			// Create per-user database file for the new user
			try {
				await createUserDatabase(user.id)
			} catch (error) {
				// Rollback: delete the user from the central DB
				await authDb.user.delete({ where: { id: user.id } })
				console.error(
					`[AUTH] Failed to create user database for ${user.id}:`,
					error,
				)
				return {
					success: false,
					error: 'Kunde inte skapa användardatabas',
				}
			}
		}

		// Skapa tokens
		const sessionId = randomUUID()
		const tokenPayload = { userId: user.id, email: user.email, sessionId }
		const accessToken = await createAccessToken(tokenPayload)
		const {
			token: refreshToken,
			jti,
			expiresAt,
		} = await createRefreshToken(tokenPayload)

		// Persist only the digest; jti identifies rotations for reuse detection.
		await authDb.session.create({
			data: {
				id: sessionId,
				userId: user.id,
				refreshTokenHash: hashRefreshToken(refreshToken),
				jti,
				expiresAt,
			},
		})

		return {
			success: true,
			accessToken,
			refreshToken,
			user: {
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
			},
		}
	}

	/** Revoke legacy plaintext sessions before accepting requests after upgrade. */
	async revokeLegacySessions(): Promise<void> {
		await authDb.session.deleteMany({
			where: { NOT: { refreshTokenHash: { startsWith: 'sha256:' } } },
		})
	}

	async refreshAccessToken(refreshToken: string): Promise<{
		success: boolean
		accessToken?: string
		newRefreshToken?: string
		error?: string
	}> {
		const payload = await verifyRefreshToken(refreshToken)
		if (!payload) return { success: false, error: 'Ogiltig refresh token' }

		const loadSession = () =>
			authDb.session.findFirst({
				where: { id: payload.sessionId, userId: payload.userId },
				include: { user: true },
			})
		let session = await loadSession()
		if (!session || session.expiresAt.getTime() <= Date.now()) {
			return { success: false, error: 'Session hittades inte' }
		}

		const tokenPayload = {
			userId: session.userId,
			email: session.user.email,
			sessionId: session.id,
		}
		const presentedHash = hashRefreshToken(refreshToken)
		const inGrace = () =>
			session?.previousJtiAt !== null &&
			session?.previousJtiAt !== undefined &&
			Date.now() - session.previousJtiAt.getTime() <= REFRESH_GRACE_WINDOW_MS

		if (session.jti === payload.jti) {
			if (!secureStringEquals(session.refreshTokenHash, presentedHash)) {
				return { success: false, error: 'Ogiltig refresh token' }
			}
			// Keep the winner stable while concurrent tabs receive its cookie.
			if (!inGrace()) {
				const next = await createRefreshToken(tokenPayload)
				const rotated = await authDb.session.updateMany({
					where: {
						id: session.id,
						jti: payload.jti,
						refreshTokenHash: presentedHash,
						expiresAt: { gt: new Date() },
					},
					data: {
						refreshTokenHash: hashRefreshToken(next.token),
						jti: next.jti,
						previousJti: payload.jti,
						previousJtiAt: new Date(),
						expiresAt: next.expiresAt,
					},
				})
				if (rotated.count === 1) {
					return {
						success: true,
						accessToken: await createAccessToken(tokenPayload),
						newRefreshToken: next.token,
					}
				}
				// A competing request rotated or revoked the session first.
				session = await loadSession()
				if (!session || session.expiresAt.getTime() <= Date.now()) {
					return { success: false, error: 'Session hittades inte' }
				}
			}
		}

		if (
			inGrace() &&
			(session.jti === payload.jti || session.previousJti === payload.jti)
		) {
			const current = await createRefreshToken(tokenPayload, {
				jti: session.jti,
				expiresAt: session.expiresAt,
			})
			if (
				!secureStringEquals(
					hashRefreshToken(current.token),
					session.refreshTokenHash,
				)
			) {
				return { success: false, error: 'Ogiltig refresh token' }
			}
			return {
				success: true,
				accessToken: await createAccessToken(tokenPayload),
				newRefreshToken: current.token,
			}
		}

		// A signed stale token for an existing session indicates reuse.
		await this.logoutAll(payload.userId)
		await sendSecurityAlertEmail(
			payload.email,
			'En tidigare använd inloggningssession har återanvänts. Alla sessioner har avslutats. Logga in igen.',
		).catch(() => undefined)
		return { success: false, error: 'Session hittades inte' }
	}

	async logout(refreshToken: string): Promise<void> {
		const payload = await verifyRefreshToken(refreshToken)
		if (!payload) return
		// The stable session ID also handles logout racing with rotation.
		await authDb.session.deleteMany({
			where: { id: payload.sessionId, userId: payload.userId },
		})
	}

	/**
	 * Logga ut från alla enheter
	 */
	async logoutAll(userId: string): Promise<void> {
		await authDb.session.deleteMany({
			where: { userId },
		})
	}

	/**
	 * Hämta användare med ID
	 */
	async getUserById(userId: string) {
		return authDb.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				email: true,
				firstName: true,
				lastName: true,
				createdAt: true,
				updatedAt: true,
			},
		})
	}
}

export const authService = new AuthService()
