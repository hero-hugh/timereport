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

		// Save
		await page.getByRole('button', { name: 'Spara' }).click()

		// Bar should disappear after save
		await expect(
			page.getByText('Du har osparade ändringar'),
		).not.toBeVisible()

		// The value should persist (formatted as 8:00)
		await expect(firstInput).toHaveValue('8:00')
	})
})
