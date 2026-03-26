import { test, expect } from '@playwright/test'
import { login } from './helpers/auth'

const TEST_EMAIL = 'e2e-test@example.com'
const PROJECT_NAME = `E2E Projekt ${Date.now()}`

test.describe('Projects', () => {
	test.beforeEach(async ({ page }) => {
		await login(page, TEST_EMAIL)
	})

	test('can create a new project', async ({ page }) => {
		await page.goto('/projects')
		await page.getByRole('link', { name: 'Nytt' }).click()

		// Fill in project form
		await page.getByLabel('Projektnamn').fill(PROJECT_NAME)
		await page.getByLabel('Beskrivning').fill('Skapat av Playwright')
		await page.getByLabel('Timpris').fill('850')

		// Submit
		await page.getByRole('button', { name: 'Skapa projekt' }).click()

		// Should redirect to projects list
		await page.waitForURL('/projects')

		// Project should appear in the list
		await expect(page.getByText(PROJECT_NAME)).toBeVisible()
	})

	test('can edit a project', async ({ page }) => {
		await page.goto('/projects')

		// Click on the project we just created (exact match)
		await page.getByText(PROJECT_NAME, { exact: true }).click()

		// Change the description
		const descInput = page.getByLabel('Beskrivning')
		await descInput.clear()
		await descInput.fill('Uppdaterat av Playwright')

		// Save
		await page.getByRole('button', { name: 'Spara ändringar' }).click()

		// Should redirect back to list
		await page.waitForURL('/projects')
		await expect(page.getByText(PROJECT_NAME)).toBeVisible()
	})
})
