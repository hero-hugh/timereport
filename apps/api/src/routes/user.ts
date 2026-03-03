import { Hono } from 'hono'
import { z } from 'zod'
import { authDb } from '../lib/auth-db'
import { getAuthUser, requireAuth } from '../middleware/auth'

const user = new Hono()

user.use('*', requireAuth)

const updateProfileSchema = z.object({
	firstName: z
		.string()
		.min(2, 'Förnamn måste vara minst 2 tecken')
		.max(50, 'Förnamn får vara max 50 tecken')
		.regex(
			/^[\p{L}\s-]{2,50}$/u,
			'Förnamn får bara innehålla bokstäver, mellanslag och bindestreck',
		),
	lastName: z
		.string()
		.min(2, 'Efternamn måste vara minst 2 tecken')
		.max(50, 'Efternamn får vara max 50 tecken')
		.regex(
			/^[\p{L}\s-]{2,50}$/u,
			'Efternamn får bara innehålla bokstäver, mellanslag och bindestreck',
		),
})

const saveBoxTokenSchema = z.object({
	token: z.string().min(1, 'Token får inte vara tom'),
})

/**
 * PATCH /api/user/profile
 * Update the authenticated user's profile (firstName, lastName)
 */
user.patch('/profile', async (c) => {
	const { userId } = getAuthUser(c)
	const body = await c.req.json()

	const parsed = updateProfileSchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const updatedUser = await authDb.user.update({
		where: { id: userId },
		data: {
			firstName: parsed.data.firstName,
			lastName: parsed.data.lastName,
		},
		select: {
			id: true,
			email: true,
			firstName: true,
			lastName: true,
		},
	})

	return c.json({ success: true, data: updatedUser })
})

/**
 * GET /api/user/box-token
 * Check if the user has a BOX API token configured
 */
user.get('/box-token', async (c) => {
	const { userId } = getAuthUser(c)

	const dbUser = await authDb.user.findUnique({
		where: { id: userId },
		select: { boxApiToken: true },
	})

	return c.json({
		success: true,
		data: { hasToken: !!dbUser?.boxApiToken },
	})
})

/**
 * PUT /api/user/box-token
 * Save a BOX API token for the authenticated user
 */
user.put('/box-token', async (c) => {
	const { userId } = getAuthUser(c)
	const body = await c.req.json()

	const parsed = saveBoxTokenSchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	await authDb.user.update({
		where: { id: userId },
		data: { boxApiToken: parsed.data.token },
	})

	return c.json({ success: true, data: { message: 'Token sparad' } })
})

export default user
