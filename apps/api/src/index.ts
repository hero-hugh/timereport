import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import auth from './routes/auth'
import holidays from './routes/holidays'
import projects from './routes/projects'
import reports from './routes/reports'
import timeEntries from './routes/time-entries'

const app = new Hono()

// Middleware
app.use(
	'*',
	cors({
		origin: process.env.FRONTEND_URL || 'http://localhost:5173',
		credentials: true,
	}),
)
app.use('*', logger())

// Health check
app.get('/api/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.route('/api/auth', auth)
app.route('/api/projects', projects)
app.route('/api/time-entries', timeEntries)
app.route('/api/reports', reports)
app.route('/api/holidays', holidays)

// 404 handler
app.notFound((c) => {
	return c.json({ success: false, error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
	console.error('Server error:', err)
	return c.json(
		{
			success: false,
			error:
				process.env.NODE_ENV === 'development'
					? err.message
					: 'Internal server error',
		},
		500,
	)
})

const port = Number(process.env.PORT) || 3000

console.log(`Starting server on port ${port}...`)

serve({
	fetch: app.fetch,
	port,
})

console.log(`Server running at http://localhost:${port}`)

export default app
