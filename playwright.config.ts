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
	webServer: {
		command: 'E2E_TEST_OTP=000000 npm run dev',
		url: 'http://localhost:5173',
		reuseExistingServer: true,
		timeout: 120_000,
	},
})
