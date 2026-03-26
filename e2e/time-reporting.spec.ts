import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = 'e2e-test@example.com'

test.describe('Time reporting', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, TEST_EMAIL)
	})

	test('can report time on a project', async ({ page }) => {
		await page.goto('/time')

		// Wait for the time grid to load
		await page.getByText('Vecka').first().waitFor()

		// Find a visible time input cell and fill it
		const firstInput = page
			.locator('input[inputmode="decimal"]')
			.and(page.locator(':visible'))
			.first()
		await firstInput.click()
		await firstInput.fill('8')
		await firstInput.blur()

		// The unsaved changes bar should appear
		await expect(page.getByText('Du har osparade ändringar')).toBeVisible()

		// Click save and wait for the API response
		const [saveResponse] = await Promise.all([
			page.waitForResponse(
				(resp) =>
					resp.url().includes('/api/time-entries') &&
					resp.request().method() === 'POST',
			),
			page.getByRole('button', { name: 'Spara' }).click(),
		])

		// Verify the save succeeded
		expect(saveResponse.status()).toBe(201)

		// The value should persist (formatted as 8:00)
		await expect(firstInput).toHaveValue('8:00')
	})
})
