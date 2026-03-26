import type { Page } from '@playwright/test'

const TEST_OTP = '000000'

/**
 * Log in via the UI. Requires the API to be started with E2E_TEST_OTP=000000.
 */
export async function login(page: Page, email: string) {
	await page.goto('/login')
	await page.getByLabel('E-post').fill(email)
	await page.getByRole('button', { name: 'Skicka kod' }).click()

	// Wait for OTP input to appear
	await page.getByText('6-siffrig kod').waitFor()

	// Type the known OTP code
	for (const digit of TEST_OTP) {
		await page.keyboard.type(digit, { delay: 50 })
	}

	// Wait for redirect to dashboard
	await page.waitForURL('/', { timeout: 10_000 })
}
