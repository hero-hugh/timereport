import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './e2e',
	timeout: 30_000,
	retries: 0,
	workers: 1,
	use: {
		baseURL: 'http://localhost:5173',
		screenshot: 'only-on-failure',
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { browserName: 'chromium' },
		},
	],
	// Start each server directly so Turbo cannot filter the API's test environment.
	webServer: [
		{
			command: 'npm run dev:api',
			url: 'http://localhost:3000/api/health',
			env: { NODE_ENV: 'test', E2E_TEST_OTP: '000000' },
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
		{
			command: 'npm run dev:web',
			url: 'http://localhost:5173',
			env: { VITE_API_URL: 'http://localhost:3000' },
			reuseExistingServer: !process.env.CI,
			timeout: 120_000,
		},
	],
})
