import { createHash, randomUUID } from 'node:crypto'
import * as jose from 'jose'

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60

export interface TokenPayload {
	userId: string
	email: string
	sessionId: string
}

function getSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): Uint8Array {
	const secret = process.env[name]
	if (!secret || secret.length < 32) {
		throw new Error(`${name} must be at least 32 characters`)
	}
	return new TextEncoder().encode(secret)
}

function readPayload(payload: jose.JWTPayload): TokenPayload | null {
	if (
		typeof payload.userId !== 'string' ||
		!payload.userId ||
		typeof payload.email !== 'string' ||
		!payload.email ||
		typeof payload.sessionId !== 'string' ||
		!payload.sessionId ||
		typeof payload.exp !== 'number'
	)
		return null
	return {
		userId: payload.userId,
		email: payload.email,
		sessionId: payload.sessionId,
	}
}

export async function createAccessToken(
	payload: TokenPayload,
): Promise<string> {
	return new jose.SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(ACCESS_TOKEN_EXPIRY)
		.sign(getSecret('JWT_SECRET'))
}

/**
 * Signing is deterministic for the same session, jti and expiry. During the
 * short concurrency grace window we can reissue the winning token using the
 * signing key, without storing a reusable bearer credential in the database.
 */
export async function createRefreshToken(
	payload: TokenPayload,
	options: { jti?: string; expiresAt?: Date } = {},
): Promise<{ token: string; jti: string; expiresAt: Date }> {
	const jti = options.jti ?? randomUUID()
	const expiresAt = options.expiresAt ?? getRefreshTokenExpiry()
	const expiry = Math.floor(expiresAt.getTime() / 1000)
	const token = await new jose.SignJWT({
		userId: payload.userId,
		email: payload.email,
		sessionId: payload.sessionId,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setJti(jti)
		.setIssuedAt(expiry - REFRESH_TOKEN_SECONDS)
		.setExpirationTime(expiry)
		.sign(getSecret('JWT_REFRESH_SECRET'))
	return { token, jti, expiresAt: new Date(expiry * 1000) }
}

export function hashRefreshToken(token: string): string {
	return `sha256:${createHash('sha256').update(token).digest('hex')}`
}

export async function verifyAccessToken(
	token: string,
): Promise<TokenPayload | null> {
	try {
		const { payload } = await jose.jwtVerify(token, getSecret('JWT_SECRET'), {
			algorithms: ['HS256'],
		})
		return readPayload(payload)
	} catch {
		return null
	}
}

export async function verifyRefreshToken(
	token: string,
): Promise<(TokenPayload & { jti: string }) | null> {
	try {
		const { payload } = await jose.jwtVerify(
			token,
			getSecret('JWT_REFRESH_SECRET'),
			{
				algorithms: ['HS256'],
			},
		)
		const claims = readPayload(payload)
		if (!claims || typeof payload.jti !== 'string' || !payload.jti) return null
		return { ...claims, jti: payload.jti }
	} catch {
		return null
	}
}

export function getRefreshTokenExpiry(): Date {
	return new Date(
		(Math.floor(Date.now() / 1000) + REFRESH_TOKEN_SECONDS) * 1000,
	)
}

export const JWT_CONFIG = {
	accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
	refreshTokenExpiry: '7d',
	cookieOptions: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict' as const,
		path: '/',
	},
} as const
