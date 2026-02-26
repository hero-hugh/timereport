import { randomUUID } from 'node:crypto'
import * as jose from 'jose'

const ACCESS_TOKEN_EXPIRY = '15m'
const REFRESH_TOKEN_EXPIRY = '7d'

interface TokenPayload {
	userId: string
	email: string
}

function getJwtSecret(): Uint8Array {
	const secret = process.env.JWT_SECRET
	if (!secret || secret.length < 32) {
		throw new Error('JWT_SECRET must be at least 32 characters')
	}
	return new TextEncoder().encode(secret)
}

function getRefreshSecret(): Uint8Array {
	const secret = process.env.JWT_REFRESH_SECRET
	if (!secret || secret.length < 32) {
		throw new Error('JWT_REFRESH_SECRET must be at least 32 characters')
	}
	return new TextEncoder().encode(secret)
}

/**
 * Skapa access token (kort livstid)
 */
export async function createAccessToken(
	payload: TokenPayload,
): Promise<string> {
	return new jose.SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(ACCESS_TOKEN_EXPIRY)
		.sign(getJwtSecret())
}

/**
 * Skapa refresh token (lång livstid)
 * Inkluderar jti (JWT ID) för att garantera unikhet vid token rotation
 */
export async function createRefreshToken(
	payload: TokenPayload,
): Promise<string> {
	return new jose.SignJWT({ ...payload })
		.setProtectedHeader({ alg: 'HS256' })
		.setJti(randomUUID())
		.setIssuedAt()
		.setExpirationTime(REFRESH_TOKEN_EXPIRY)
		.sign(getRefreshSecret())
}

/**
 * Verifiera access token
 */
export async function verifyAccessToken(
	token: string,
): Promise<TokenPayload | null> {
	try {
		const { payload } = await jose.jwtVerify(token, getJwtSecret())
		return {
			userId: payload.userId as string,
			email: payload.email as string,
		}
	} catch {
		return null
	}
}

/**
 * Verifiera refresh token
 */
export async function verifyRefreshToken(
	token: string,
): Promise<TokenPayload | null> {
	try {
		const { payload } = await jose.jwtVerify(token, getRefreshSecret())
		return {
			userId: payload.userId as string,
			email: payload.email as string,
		}
	} catch {
		return null
	}
}

/**
 * Beräkna utgångsdatum för refresh token (för databas)
 */
export function getRefreshTokenExpiry(): Date {
	return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 dagar
}

export const JWT_CONFIG = {
	accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
	refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
	cookieOptions: {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict' as const,
		path: '/',
	},
} as const
