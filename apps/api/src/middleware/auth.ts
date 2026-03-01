import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { verifyAccessToken } from '../lib/jwt'
import { type UserPrismaClient, getUserDb } from '../lib/user-db'

export interface AuthUser {
	userId: string
	email: string
}

/**
 * Middleware som kräver autentisering
 */
export async function requireAuth(c: Context, next: Next) {
	// Försök hämta token från cookie först, sedan Authorization header
	let token = getCookie(c, 'access_token')

	if (!token) {
		const authHeader = c.req.header('Authorization')
		if (authHeader?.startsWith('Bearer ')) {
			token = authHeader.slice(7)
		}
	}

	if (!token) {
		return c.json({ success: false, error: 'Autentisering krävs' }, 401)
	}

	const payload = await verifyAccessToken(token)
	if (!payload) {
		return c.json(
			{ success: false, error: 'Ogiltig eller utgången token' },
			401,
		)
	}

	// Sätt användare på context
	c.set('user', payload)

	// Resolve and attach the per-user DB client
	const userDb = getUserDb(payload.userId)
	c.set('userDb', userDb)

	await next()
}

/**
 * Hämta autentiserad användare från context
 */
export function getAuthUser(c: Context): AuthUser {
	return c.get('user') as AuthUser
}

/**
 * Hämta per-user DB client från context
 */
export function getAuthUserDb(c: Context): UserPrismaClient {
	return c.get('userDb') as UserPrismaClient
}
