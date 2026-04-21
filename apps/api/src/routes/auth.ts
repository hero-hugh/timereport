import { requestOtpSchema, verifyOtpSchema } from '@time-report/shared'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { rateLimiter } from 'hono-rate-limiter'
import { JWT_CONFIG } from '../lib/jwt'
import { getAuthUser, requireAuth } from '../middleware/auth'
import { authService } from '../services/auth.service'

const auth = new Hono()

// Trust proxy headers i prod (nginx/Cloudflare framför); i dev använd connection.
const clientKey = (c: Context): string =>
	c.req.header('cf-connecting-ip') ??
	c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
	c.req.header('x-real-ip') ??
	'unknown'

const skipInTest = (): boolean => process.env.NODE_ENV === 'test'

const requestOtpLimiter = rateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 3,
	standardHeaders: 'draft-6',
	keyGenerator: clientKey,
	skip: skipInTest,
	message: { success: false, error: 'För många försök, vänta en stund' },
})

const verifyOtpLimiter = rateLimiter({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: 'draft-6',
	keyGenerator: clientKey,
	skip: skipInTest,
	message: { success: false, error: 'För många försök, vänta en stund' },
})

/**
 * POST /api/auth/request-otp
 * Begär OTP-kod till e-postadress
 */
auth.post('/request-otp', requestOtpLimiter, async (c) => {
	const body = await c.req.json()
	const parsed = requestOtpSchema.safeParse(body)

	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const result = await authService.requestOtp(parsed.data.email)

	if (!result.success) {
		return c.json({ success: false, error: result.error }, 400)
	}

	return c.json({
		success: true,
		message: 'OTP-kod skickad till din e-post',
	})
})

/**
 * POST /api/auth/verify-otp
 * Verifiera OTP-kod och logga in
 */
auth.post('/verify-otp', verifyOtpLimiter, async (c) => {
	const body = await c.req.json()
	const parsed = verifyOtpSchema.safeParse(body)

	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const result = await authService.verifyOtp(
		parsed.data.email,
		parsed.data.code,
	)

	if (!result.success || !result.accessToken || !result.refreshToken) {
		return c.json({ success: false, error: result.error }, 401)
	}

	// Sätt cookies
	setCookie(c, 'access_token', result.accessToken, {
		...JWT_CONFIG.cookieOptions,
		maxAge: 15 * 60, // 15 minuter
	})

	setCookie(c, 'refresh_token', result.refreshToken, {
		...JWT_CONFIG.cookieOptions,
		maxAge: 7 * 24 * 60 * 60, // 7 dagar
	})

	return c.json({
		success: true,
		data: { user: result.user },
	})
})

/**
 * POST /api/auth/refresh
 * Förnya access token med refresh token
 */
auth.post('/refresh', async (c) => {
	const refreshToken = getCookie(c, 'refresh_token')

	if (!refreshToken) {
		return c.json({ success: false, error: 'Refresh token saknas' }, 401)
	}

	const result = await authService.refreshAccessToken(refreshToken)

	if (!result.success || !result.accessToken || !result.newRefreshToken) {
		// Rensa cookies vid misslyckande
		deleteCookie(c, 'access_token')
		deleteCookie(c, 'refresh_token')
		return c.json({ success: false, error: result.error }, 401)
	}

	// Sätt nya cookies
	setCookie(c, 'access_token', result.accessToken, {
		...JWT_CONFIG.cookieOptions,
		maxAge: 15 * 60,
	})

	setCookie(c, 'refresh_token', result.newRefreshToken, {
		...JWT_CONFIG.cookieOptions,
		maxAge: 7 * 24 * 60 * 60,
	})

	return c.json({ success: true })
})

/**
 * POST /api/auth/logout
 * Logga ut användare
 */
auth.post('/logout', async (c) => {
	const refreshToken = getCookie(c, 'refresh_token')

	if (refreshToken) {
		await authService.logout(refreshToken)
	}

	deleteCookie(c, 'access_token')
	deleteCookie(c, 'refresh_token')

	return c.json({ success: true, message: 'Utloggad' })
})

/**
 * GET /api/auth/me
 * Hämta inloggad användare
 */
auth.get('/me', requireAuth, async (c) => {
	const { userId } = getAuthUser(c)
	const user = await authService.getUserById(userId)

	if (!user) {
		return c.json({ success: false, error: 'Användare hittades inte' }, 404)
	}

	return c.json({ success: true, data: user })
})

export default auth
