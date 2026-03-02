import { boxTokenSchema } from '@time-report/shared'
import { Hono } from 'hono'
import { authDb } from '../lib/auth-db'
import { getAuthUser, requireAuth } from '../middleware/auth'

const settings = new Hono()

// Alla routes kräver autentisering
settings.use('*', requireAuth)

/**
 * PUT /api/settings/box-token
 * Spara BOX API-token för användaren
 */
settings.put('/box-token', async (c) => {
	const { userId } = getAuthUser(c)

	const body = await c.req.json()
	const parsed = boxTokenSchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltig token',
			},
			400,
		)
	}

	await authDb.user.update({
		where: { id: userId },
		data: { boxApiToken: parsed.data.token },
	})

	return c.json({ success: true })
})

/**
 * GET /api/settings/box-token
 * Kontrollera om användaren har en BOX API-token konfigurerad
 */
settings.get('/box-token', async (c) => {
	const { userId } = getAuthUser(c)

	const user = await authDb.user.findUnique({
		where: { id: userId },
		select: { boxApiToken: true },
	})

	return c.json({
		success: true,
		data: { hasToken: !!user?.boxApiToken },
	})
})

export default settings
