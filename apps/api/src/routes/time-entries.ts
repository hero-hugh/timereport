import {
	createTimeEntrySchema,
	timeEntriesQuerySchema,
	updateTimeEntrySchema,
} from '@time-report/shared'
import { Hono } from 'hono'
import { getAuthUser, requireAuth } from '../middleware/auth'
import { timeEntryService } from '../services/time-entry.service'

const timeEntries = new Hono()

// Alla routes kräver autentisering
timeEntries.use('*', requireAuth)

/**
 * GET /api/time-entries
 * Lista tidrapporter med filter
 */
timeEntries.get('/', async (c) => {
	const { userId } = getAuthUser(c)

	const query = {
		projectId: c.req.query('projectId'),
		from: c.req.query('from'),
		to: c.req.query('to'),
	}

	const parsed = timeEntriesQuerySchema.safeParse(query)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga filter',
			},
			400,
		)
	}

	const entries = await timeEntryService.getTimeEntries(userId, parsed.data)

	return c.json({ success: true, data: entries })
})

/**
 * GET /api/time-entries/week
 * Hämta tidrapporter för en vecka
 */
timeEntries.get('/week', async (c) => {
	const { userId } = getAuthUser(c)
	const dateParam = c.req.query('date')

	// Default till denna vecka
	let weekStart: Date
	if (dateParam) {
		// Parse as UTC to avoid timezone issues
		weekStart = new Date(dateParam + 'T00:00:00.000Z')
	} else {
		weekStart = new Date()
		weekStart.setUTCHours(0, 0, 0, 0)
	}

	// Justera till måndagen (using UTC)
	const dayOfWeek = weekStart.getUTCDay()
	const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
	weekStart.setUTCDate(weekStart.getUTCDate() + diff)

	const entries = await timeEntryService.getWeekEntries(userId, weekStart)

	return c.json({
		success: true,
		data: {
			data: entries,
			weekStart: weekStart.toISOString().split('T')[0],
		},
	})
})

/**
 * GET /api/time-entries/:id
 * Hämta specifik tidrapport
 */
timeEntries.get('/:id', async (c) => {
	const { userId } = getAuthUser(c)
	const entryId = c.req.param('id')

	const entry = await timeEntryService.getTimeEntry(entryId, userId)

	if (!entry) {
		return c.json({ success: false, error: 'Tidrapport hittades inte' }, 404)
	}

	return c.json({ success: true, data: entry })
})

/**
 * POST /api/time-entries
 * Skapa eller uppdatera tidrapport
 */
timeEntries.post('/', async (c) => {
	const { userId } = getAuthUser(c)
	const body = await c.req.json()

	const parsed = createTimeEntrySchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const result = await timeEntryService.createOrUpdateTimeEntry(
		userId,
		parsed.data,
	)

	if (!result.success) {
		return c.json({ success: false, error: result.error }, 400)
	}

	return c.json({ success: true, data: result.data }, 201)
})

/**
 * PATCH /api/time-entries/:id
 * Uppdatera tidrapport
 */
timeEntries.patch('/:id', async (c) => {
	const { userId } = getAuthUser(c)
	const entryId = c.req.param('id')
	const body = await c.req.json()

	const parsed = updateTimeEntrySchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const result = await timeEntryService.updateTimeEntry(
		entryId,
		userId,
		parsed.data,
	)

	if (!result.success) {
		return c.json({ success: false, error: result.error }, 404)
	}

	return c.json({ success: true, data: result.data })
})

/**
 * DELETE /api/time-entries/:id
 * Ta bort tidrapport
 */
timeEntries.delete('/:id', async (c) => {
	const { userId } = getAuthUser(c)
	const entryId = c.req.param('id')

	const deleted = await timeEntryService.deleteTimeEntry(entryId, userId)

	if (!deleted) {
		return c.json({ success: false, error: 'Tidrapport hittades inte' }, 404)
	}

	return c.json({ success: true, message: 'Tidrapport borttagen' })
})

export default timeEntries
