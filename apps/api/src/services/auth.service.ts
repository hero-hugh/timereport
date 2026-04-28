import { authDb } from '../lib/auth-db'
import { sendSecurityAlertEmail } from '../lib/email'
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
	if (entry.count >= MAX_EMAIL_FAILURES) {
		entry.lockedUntil = Date.now() + EMAIL_LOCK_MS
		// Lås → meddela användaren. Bäst-ansträngning, fortsätt oavsett resultat.
		await sendSecurityAlertEmail(
			email,
			'Någon har försökt logga in på ditt konto med fel kod flera gånger. Inloggningen är tillfälligt pausad i 30 minuter.',
		).catch(() => undefined)
	}
	failedByEmail.set(email, entry)
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
			await authDb.otpCode.update({
				where: { id: otpRecord.id },
				data: { attempts: otpRecord.attempts + 1 },
			})
			await recordEmailFailure(normalizedEmail)
			return { success: false, error: 'Ogiltig eller utgången kod' }
		}

		// Markera koden som använd
		await authDb.otpCode.update({
			where: { id: otpRecord.id },
			data: { used: true },
		})

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
		const tokenPayload = { userId: user.id, email: user.email }
		const accessToken = await createAccessToken(tokenPayload)
		const { token: refreshToken, jti } = await createRefreshToken(tokenPayload)

		// Spara refresh token + jti i databas. jti används för reuse detection
		// vid refresh — se refreshAccessToken nedan.
		await authDb.session.create({
			data: {
				userId: user.id,
				refreshToken,
				jti,
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
				firstName: user.firstName,
				lastName: user.lastName,
			},
		}
	}

	/**
	 * Förnya access token med refresh token. Implementerar refresh token
	 * reuse detection (OWASP-rekommendation): om en tidigare-roterad token
	 * presenteras igen, invalideras ALLA sessioner för användaren och
	 * en säkerhetsvarning skickas.
	 */
	async refreshAccessToken(refreshToken: string): Promise<{
		success: boolean
		accessToken?: string
		newRefreshToken?: string
		error?: string
	}> {
		const payload = await verifyRefreshToken(refreshToken)
		if (!payload) {
			return { success: false, error: 'Ogiltig refresh token' }
		}

		// Slå upp session via jti (unikt per refresh token). Om tokenens jti
		// inte längre finns i DB betyder det att den har roterats bort —
		// en NY token har ersatt den. Att samma jti presenteras igen är
		// alltså en reuse av en gammal token.
		const session = await authDb.session.findUnique({
			where: { jti: payload.jti },
			include: { user: true },
		})

		if (!session) {
			// Kanske concurrent /refresh — en parallell tabb hann rotera
			// medan denna förfrågan var in-flight med gamla jti:n. Tolerera
			// replay av nyligen-roterad token inom REFRESH_GRACE_WINDOW_MS
			// genom att returnera den nyss utfärdade refresh-tokenen.
			const racedSession = await authDb.session.findUnique({
				where: { previousJti: payload.jti },
				include: { user: true },
			})
			if (
				racedSession?.previousJtiAt &&
				Date.now() - racedSession.previousJtiAt.getTime() <=
					REFRESH_GRACE_WINDOW_MS &&
				new Date() <= racedSession.expiresAt
			) {
				const tokenPayload = {
					userId: racedSession.userId,
					email: racedSession.user.email,
				}
				const newAccessToken = await createAccessToken(tokenPayload)
				return {
					success: true,
					accessToken: newAccessToken,
					newRefreshToken: racedSession.refreshToken,
				}
			}

			// Token-signaturen är giltig (JWT secret har inte läckt), men den
			// matchar varken aktiv session eller nyligen-roterad. Om användaren
			// har andra aktiva sessioner är detta en stulen, tidigare-roterad
			// token — invalidera allt och varna.
			const otherSessions = await authDb.session.findMany({
				where: { userId: payload.userId },
				select: { id: true },
			})
			if (otherSessions.length > 0) {
				await authDb.session.deleteMany({
					where: { userId: payload.userId },
				})
				await sendSecurityAlertEmail(
					payload.email,
					'En tidigare-använd inloggnings-session har återanvänts. Det kan tyda på att någon har kopierat din session från en annan enhet.',
				).catch(() => undefined)
			}
			return { success: false, error: 'Session hittades inte' }
		}

		if (new Date() > session.expiresAt) {
			await authDb.session.delete({ where: { id: session.id } })
			return { success: false, error: 'Session har gått ut' }
		}

		// Refresh token rotation — skapa nya tokens och uppdatera session
		// atomärt. Att uppdatera jti samtidigt som refreshToken stänger ute
		// den gamla tokenen omedelbart. previousJti + previousJtiAt sparas
		// så att en parallell concurrent refresh kan accepteras inom grace.
		const tokenPayload = { userId: session.userId, email: session.user.email }
		const newAccessToken = await createAccessToken(tokenPayload)
		const { token: newRefreshToken, jti: newJti } =
			await createRefreshToken(tokenPayload)

		await authDb.session.update({
			where: { id: session.id },
			data: {
				refreshToken: newRefreshToken,
				jti: newJti,
				previousJti: session.jti,
				previousJtiAt: new Date(),
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
		await authDb.session.deleteMany({
			where: { refreshToken },
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
