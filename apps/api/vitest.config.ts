import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
	// Load .env.test (vitest defaults to mode='test') and put all vars on
	// process.env so that forked workers AND the Prisma query engine binary
	// can read them.
	Object.assign(process.env, loadEnv(mode, __dirname, ''))

	return {
		root: __dirname,
		test: {
			globals: true,
			environment: 'node',
			include: ['src/**/*.test.ts'],
			setupFiles: ['./src/test/setup.ts'],
			// Kör tester sekventiellt för att undvika databaskonflikter
			pool: 'forks',
			maxWorkers: 1,
			fileParallelism: false,
			testTimeout: 10000,
		},
	}
})
