import { randomBytes, randomUUID } from 'node:crypto'
import { authDb } from '../lib/auth-db'

/** Database fixture for route tests that mock JWT verification. */
export async function createTestSession(userId = 'test-user-id') {
	await authDb.user.upsert({
		where: { id: userId },
		create: { id: userId, email: `${userId}@example.test` },
		update: {},
	})
	return authDb.session.create({
		data: {
			userId,
			refreshTokenHash: `sha256:${randomBytes(32).toString('hex')}`,
			jti: randomUUID(),
			expiresAt: new Date(Date.now() + 86400000),
		},
	})
}
