import { serve } from '@hono/node-server'
import { type Context, Hono } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'

import { requireAuth } from './middleware/auth'
import auth from './routes/auth'
import boxSync from './routes/box-sync'
import holidays from './routes/holidays'
import projects from './routes/projects'
import reports from './routes/reports'
import timeEntries from './routes/time-entries'
import user from './routes/user'

// Startup-säkerhetsassertions — misconfig ska inte gå att missa i prod.
// NODE_ENV måste vara exakt ett känt värde; annars baila ut. Detta skyddar
// bland annat mot att cookie `secure`-flaggan (bunden till
// NODE_ENV === 'production') tyst blir false vid stavfel som 'Production'
// eller 'production ' (med trailing space).
const VALID_NODE_ENVS = ['production', 'development', 'test'] as const
type NodeEnv = (typeof VALID_NODE_ENVS)[number]
if (!VALID_NODE_ENVS.includes(process.env.NODE_ENV as NodeEnv)) {
	throw new Error(
		`NODE_ENV must be one of ${VALID_NODE_ENVS.join(', ')} (got ${JSON.stringify(process.env.NODE_ENV)}).`,
	)
}

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
// CSRF: djupförsvar utöver SameSite=Strict. Verifierar Origin-header mot
// tillåten frontend på state-ändrande metoder (POST/PUT/PATCH/DELETE).
// Explicit origin — fallback till undefined skulle tillåta luddig Host-
// jämförelse om FRONTEND_URL saknades (t.ex. vid dev-tunnel mot publikt IP).
app.use('*', csrf({ origin: ALLOWED_ORIGIN }))
app.use('*', logger())

// Health check
app.get('/api/health', (c) => {
	return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Ingen browser/proxy får cacha svar från APIet — skyddar mot att känsliga
// projekt/tider/priser hamnar i browser-history eller mellanliggande caches.
app.use('/api/*', async (c, next) => {
	await next()
	c.header('Cache-Control', 'no-store')
	c.header('Pragma', 'no-cache')
})

// Global rate limit på alla autentiserade endpoints. En stulen access token
// ska inte kunna exfiltrera hela kontot inom sekunder. Använder userId som
// nyckel (fallback till IP om JWT saknas, vilket bara inträffar om requireAuth
// inte körts).
const clientIp = (c: Context): string =>
	c.req.header('cf-connecting-ip') ??
	c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
	c.req.header('x-real-ip') ??
	'unknown'

const authenticatedLimiter = rateLimiter({
	windowMs: 60 * 1000,
	limit: 300,
	standardHeaders: 'draft-6',
	keyGenerator: (c) => {
		// `requireAuth` (kör innan limitern på samma path) sätter 'user' på
		// contexten. Vi läser via any för att undvika att trassla in Hono:s
		// Variables-generik i varje route-fil — typen definieras i middleware/auth.ts.
		const user = (c as unknown as { get: (k: string) => unknown }).get(
			'user',
		) as { userId?: string } | undefined
		return user?.userId ?? `ip:${clientIp(c)}`
	},
	skip: () => process.env.NODE_ENV === 'test',
	message: { success: false, error: 'För många anrop, vänta en stund' },
})

// Routes — auth-endpointen har sina egna fin-kornade limiters i routes/auth.ts
app.route('/api/auth', auth)

// Alla data-endpoints: kräv auth, sedan rate limit per användare.
app.use('/api/projects/*', requireAuth, authenticatedLimiter)
app.use('/api/time-entries/*', requireAuth, authenticatedLimiter)
app.use('/api/reports/*', requireAuth, authenticatedLimiter)
app.use('/api/holidays/*', requireAuth, authenticatedLimiter)
app.use('/api/user/*', requireAuth, authenticatedLimiter)
app.use('/api/box/*', requireAuth, authenticatedLimiter)

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
	// HTTPException har redan en korrekt status/response (t.ex. 403 från CSRF,
	// 429 från rate limiting). Släpp igenom den istället för att maska som 500.
	if (err instanceof HTTPException) {
		return err.getResponse()
	}
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
