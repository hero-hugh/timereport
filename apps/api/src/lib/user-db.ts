import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '../generated/user/index.js'

const userDbCache = new Map<string, PrismaClient>()

function getDatabaseDir(): string {
	const dir = process.env.DATABASE_DIR
	if (!dir) {
		throw new Error('DATABASE_DIR environment variable is not set')
	}
	return path.resolve(dir)
}

function getUserDbPath(userId: string): string {
	return path.join(getDatabaseDir(), `${userId}.db`)
}

function getUserDbUrl(userId: string): string {
	return `file:${getUserDbPath(userId)}`
}

/**
 * Returns a cached PrismaClient connected to the user's SQLite file
 * at DATABASE_DIR/<userId>.db
 */
export function getUserDb(userId: string): PrismaClient {
	const cached = userDbCache.get(userId)
	if (cached) {
		return cached
	}

	const client = new PrismaClient({
		datasourceUrl: getUserDbUrl(userId),
		log:
			process.env.NODE_ENV === 'development'
				? ['query', 'error', 'warn']
				: ['error'],
	})

	userDbCache.set(userId, client)
	return client
}

/**
 * Initializes a new SQLite file with the per-user schema.
 * Creates the DATABASE_DIR folder if it does not exist.
 */
export async function createUserDatabase(userId: string): Promise<void> {
	const dbDir = getDatabaseDir()

	// Create the database directory if it doesn't exist
	fs.mkdirSync(dbDir, { recursive: true })

	const dbPath = getUserDbPath(userId)

	// Skip if the database file already exists
	if (fs.existsSync(dbPath)) {
		return
	}

	// Resolve paths: src/lib/ -> ../../ -> apps/api/
	const apiRoot = path.resolve(
		path.dirname(new URL(import.meta.url).pathname),
		'../..',
	)
	const schemaPath = path.join(apiRoot, 'prisma/user/schema.prisma')

	// Use local prisma binary (v5.22) - npx may pull v7 with breaking changes
	const prismaBin = path.join(apiRoot, 'node_modules/.bin/prisma')
	const monorepoRoot = path.resolve(apiRoot, '../..')
	const prismaCmd = fs.existsSync(prismaBin)
		? prismaBin
		: path.join(monorepoRoot, 'node_modules/.bin/prisma')

	// Push the per-user schema to the new SQLite file
	execSync(
		`"${prismaCmd}" db push --schema="${schemaPath}" --skip-generate --accept-data-loss`,
		{
			env: {
				...process.env,
				USER_DATABASE_URL: `file:${dbPath}`,
			},
			cwd: apiRoot,
			stdio: 'pipe',
		},
	)
}

/**
 * Disconnect all cached user DB clients. Useful for cleanup/testing.
 */
export async function disconnectAllUserDbs(): Promise<void> {
	const promises: Promise<void>[] = []
	for (const client of userDbCache.values()) {
		promises.push(client.$disconnect())
	}
	await Promise.all(promises)
	userDbCache.clear()
}
