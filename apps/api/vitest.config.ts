import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['src/**/*.test.ts'],
		setupFiles: ['./src/test/setup.ts'],
		env: {
			DATABASE_URL: 'file:./test.db',
		},
		// Kör tester sekventiellt för att undvika databaskonflikter
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true,
			},
		},
		testTimeout: 10000,
	},
})
