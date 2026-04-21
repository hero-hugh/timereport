import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import auth from './routes/auth'
import boxSync from './routes/box-sync'
import holidays from './routes/holidays'
import projects from './routes/projects'
import reports from './routes/reports'
import timeEntries from './routes/time-entries'
import user from './routes/user'

// Startup-säkerhetsassertions — misconfig ska inte gå att missa i prod.
if (process.env.NODE_ENV === 'production') {
	if (process.env.E2E_TEST_OTP) {
		throw new Error(
			'E2E_TEST_OTP must not be set in production — would allow any user to log in with a fixed code.',
		)
	}
	if (!process.env.FRONTEND_URL) {
		throw new Error('FRONTEND_URL must be set in production.')
	}
	if (!process.env.FRONTEND_URL.startsWith('https://')) {
		throw new Error('FRONTEND_URL must use https:// in production.')
	}
	if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
		throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be different.')
	}
	if (!process.env.TOKEN_ENCRYPTION_KEY) {
		throw new Error(
			'TOKEN_ENCRYPTION_KEY must be set in production (base64 of 32 random bytes).',
		)
	}
	const keyBytes = Buffer.from(
		process.env.TOKEN_ENCRYPTION_KEY,
		'base64',
	).length
	if (keyBytes !== 32) {
		throw new Error(
			`TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${keyBytes}).`,
		)
	}
}

const app = new Hono()

const ALLOWED_ORIGIN =
	process.env.FRONTEND_URL ||
	(process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173')

// Middleware
app.use(
	'*',
	cors({
		origin: ALLOWED_ORIGIN,
		credentials: true,
	}),
)
app.use(
	'*',
	bodyLimit({
		maxSize: 100 * 1024, // 100 KB — alla nuvarande payloads är <4 KB
		onError: (c) =>
			c.json({ success: false, error: 'Request är för stor' }, 413),
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
app.route('/api/user', user)
app.route('/api/box', boxSync)

// 404 handler
app.notFound((c) => {
	return c.json({ success: false, error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
	console.error('Server error:', err)
	const exposeDetails = process.env.NODE_ENV !== 'production'
	return c.json(
		{
			success: false,
			error: exposeDetails ? err.message : 'Internal server error',
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
