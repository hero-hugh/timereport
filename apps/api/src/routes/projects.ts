import { createProjectSchema, updateProjectSchema } from '@time-report/shared'
import { Hono } from 'hono'
import { getAuthUser, getAuthUserDb, requireAuth } from '../middleware/auth'
import { projectService } from '../services/project.service'

const projects = new Hono()

// Alla routes kräver autentisering
projects.use('*', requireAuth)

/**
 * GET /api/projects
 * Lista alla projekt för användaren
 */
projects.get('/', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)
	const includeInactive = c.req.query('includeInactive') === 'true'

	const projectList = await projectService.getProjects(
		userDb,
		userId,
		includeInactive,
	)

	return c.json({ success: true, data: projectList })
})

/**
 * GET /api/projects/:id
 * Hämta specifikt projekt
 */
projects.get('/:id', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)
	const projectId = c.req.param('id')

	const project = await projectService.getProject(userDb, projectId, userId)

	if (!project) {
		return c.json({ success: false, error: 'Projektet hittades inte' }, 404)
	}

	return c.json({ success: true, data: project })
})

/**
 * POST /api/projects
 * Skapa nytt projekt
 */
projects.post('/', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)
	const body = await c.req.json()

	const parsed = createProjectSchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const project = await projectService.createProject(
		userDb,
		userId,
		parsed.data,
	)

	return c.json({ success: true, data: project }, 201)
})

/**
 * PATCH /api/projects/:id
 * Uppdatera projekt
 */
projects.patch('/:id', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)
	const projectId = c.req.param('id')
	const body = await c.req.json()

	const parsed = updateProjectSchema.safeParse(body)
	if (!parsed.success) {
		return c.json(
			{
				success: false,
				error: parsed.error.errors[0]?.message || 'Ogiltiga uppgifter',
			},
			400,
		)
	}

	const project = await projectService.updateProject(
		userDb,
		projectId,
		userId,
		parsed.data,
	)

	if (!project) {
		return c.json({ success: false, error: 'Projektet hittades inte' }, 404)
	}

	return c.json({ success: true, data: project })
})

/**
 * DELETE /api/projects/:id
 * Ta bort projekt
 */
projects.delete('/:id', async (c) => {
	const { userId } = getAuthUser(c)
	const userDb = getAuthUserDb(c)
	const projectId = c.req.param('id')

	const deleted = await projectService.deleteProject(userDb, projectId, userId)

	if (!deleted) {
		return c.json({ success: false, error: 'Projektet hittades inte' }, 404)
	}

	return c.json({ success: true, message: 'Projektet borttaget' })
})

export default projects
