import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetBoxTokenStatus, mockSaveBoxToken } = vi.hoisted(() => ({
	mockGetBoxTokenStatus: vi.fn(),
	mockSaveBoxToken: vi.fn(),
}))

vi.mock('../lib/api', () => ({
	api: {
		getBoxTokenStatus: mockGetBoxTokenStatus,
		saveBoxToken: mockSaveBoxToken,
	},
}))

import { ApiSettingsPage } from './ApiSettingsPage'

function renderPage() {
	return render(
		<MemoryRouter initialEntries={['/api-settings']}>
			<Routes>
				<Route path="/api-settings" element={<ApiSettingsPage />} />
			</Routes>
		</MemoryRouter>,
	)
}

describe('ApiSettingsPage', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockGetBoxTokenStatus.mockResolvedValue({
			success: true,
			data: { hasToken: false },
		})
	})

	it('should render heading and form', async () => {
		renderPage()

		expect(screen.getByText('API inställningar')).toBeInTheDocument()
		expect(screen.getByLabelText('BOX API token')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Spara' })).toBeInTheDocument()
	})

	it('should show "Ingen token konfigurerad" when no token is set', async () => {
		renderPage()

		await waitFor(() => {
			expect(screen.getByText('Ingen token konfigurerad')).toBeInTheDocument()
		})
	})

	it('should show "Token konfigurerad" when token exists', async () => {
		mockGetBoxTokenStatus.mockResolvedValue({
			success: true,
			data: { hasToken: true },
		})

		renderPage()

		await waitFor(() => {
			expect(screen.getByText('✓ Token konfigurerad')).toBeInTheDocument()
		})
	})

	it('should disable save button when token input is empty', () => {
		renderPage()

		expect(screen.getByRole('button', { name: 'Spara' })).toBeDisabled()
	})

	it('should enable save button when token is entered', async () => {
		const user = userEvent.setup()
		renderPage()

		await user.type(screen.getByLabelText('BOX API token'), 'my-token')

		expect(screen.getByRole('button', { name: 'Spara' })).not.toBeDisabled()
	})

	it('should save token and show success message', async () => {
		mockSaveBoxToken.mockResolvedValue({
			success: true,
			data: { message: 'Token saved' },
		})
		const user = userEvent.setup()

		renderPage()

		await user.type(screen.getByLabelText('BOX API token'), 'my-token')
		await user.click(screen.getByRole('button', { name: 'Spara' }))

		expect(mockSaveBoxToken).toHaveBeenCalledWith('my-token')

		await waitFor(() => {
			expect(screen.getByText('Token sparad!')).toBeInTheDocument()
		})
	})

	it('should show loading state while saving', async () => {
		let resolvePromise: (value: unknown) => void
		mockSaveBoxToken.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolvePromise = resolve
				}),
		)
		const user = userEvent.setup()

		renderPage()

		await user.type(screen.getByLabelText('BOX API token'), 'my-token')
		await user.click(screen.getByRole('button', { name: 'Spara' }))

		expect(screen.getByRole('button', { name: 'Sparar...' })).toBeDisabled()

		// Resolve the pending promise to avoid unhandled rejection
		resolvePromise!({ success: true, data: { message: 'Saved' } })
	})

	it('should show error message on save failure', async () => {
		mockSaveBoxToken.mockResolvedValue({
			success: false,
			error: 'Ogiltig token',
		})
		const user = userEvent.setup()

		renderPage()

		await user.type(screen.getByLabelText('BOX API token'), 'bad-token')
		await user.click(screen.getByRole('button', { name: 'Spara' }))

		await waitFor(() => {
			expect(screen.getByText('Ogiltig token')).toBeInTheDocument()
		})
	})

	it('should show default error message when no error text provided', async () => {
		mockSaveBoxToken.mockResolvedValue({ success: false })
		const user = userEvent.setup()

		renderPage()

		await user.type(screen.getByLabelText('BOX API token'), 'bad-token')
		await user.click(screen.getByRole('button', { name: 'Spara' }))

		await waitFor(() => {
			expect(screen.getByText('Kunde inte spara token')).toBeInTheDocument()
		})
	})

	it('should update token status to configured after successful save', async () => {
		mockSaveBoxToken.mockResolvedValue({
			success: true,
			data: { message: 'Saved' },
		})
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(screen.getByText('Ingen token konfigurerad')).toBeInTheDocument()
		})

		await user.type(screen.getByLabelText('BOX API token'), 'my-token')
		await user.click(screen.getByRole('button', { name: 'Spara' }))

		await waitFor(() => {
			expect(screen.getByText('✓ Token konfigurerad')).toBeInTheDocument()
		})
	})
})
