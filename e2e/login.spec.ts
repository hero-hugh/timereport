import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = 'e2e-test@example.com'

test.describe('Login', () => {
	test('can log in with OTP and reach dashboard', async ({ page }) => {
		await login(page, TEST_EMAIL)

		// Should be on dashboard
		await expect(page.getByText('Hej')).toBeVisible()
		await expect(page.getByText('Här är en översikt av din tid')).toBeVisible()
	})

	test('can log out', async ({ page }) => {
		await login(page, TEST_EMAIL)

		// Navigate to more page and log out
		await page.goto('/more')
		await page.getByRole('main').getByRole('button', { name: 'Logga ut' }).click()

		// Should be back on login page
		await expect(page).toHaveURL('/login')
	})
})
