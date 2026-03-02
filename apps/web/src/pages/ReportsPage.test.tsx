import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetReportSummary, mockDownloadPdfReport, mockSendToBox } =
	vi.hoisted(() => ({
		mockGetReportSummary: vi.fn(),
		mockDownloadPdfReport: vi.fn(),
		mockSendToBox: vi.fn(),
	}))

vi.mock('../lib/api', () => ({
	api: {
		getReportSummary: mockGetReportSummary,
		downloadPdfReport: mockDownloadPdfReport,
		sendToBox: mockSendToBox,
	},
}))

import { ReportsPage } from './ReportsPage'

const mockSummary = {
	totalMinutes: 480,
	totalAmount: 400000,
	projects: [
		{
			projectId: 'p1',
			projectName: 'Test Project',
			hourlyRate: 50000,
			totalMinutes: 480,
			totalAmount: 400000,
		},
	],
	period: { from: '2026-03-01', to: '2026-03-31' },
}

function renderPage() {
	return render(
		<MemoryRouter initialEntries={['/reports']}>
			<Routes>
				<Route path="/reports" element={<ReportsPage />} />
			</Routes>
		</MemoryRouter>,
	)
}

describe('ReportsPage - Skicka till BOX', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockGetReportSummary.mockResolvedValue({
			success: true,
			data: mockSummary,
		})
	})

	it('should render Skicka till BOX button when summary is loaded', async () => {
		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})
	})

	it('should show loading state while sending to BOX', async () => {
		let resolvePromise: ((value: unknown) => void) | undefined
		mockSendToBox.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolvePromise = resolve
				}),
		)
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Skicka till BOX' }))

		expect(screen.getByRole('button', { name: 'Skickar...' })).toBeDisabled()

		resolvePromise?.({ success: true, data: { message: 'OK' } })
	})

	it('should show success message after sending to BOX', async () => {
		mockSendToBox.mockResolvedValue({
			success: true,
			data: { message: 'OK' },
		})
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Skicka till BOX' }))

		await waitFor(() => {
			expect(
				screen.getByText('Tidrapporten har skickats till BOX!'),
			).toBeInTheDocument()
		})
	})

	it('should show error message when sending to BOX fails', async () => {
		mockSendToBox.mockResolvedValue({
			success: false,
			error: 'Ingen BOX API-token konfigurerad.',
		})
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Skicka till BOX' }))

		await waitFor(() => {
			expect(
				screen.getByText('Ingen BOX API-token konfigurerad.'),
			).toBeInTheDocument()
		})
	})

	it('should show default error message when no error text provided', async () => {
		mockSendToBox.mockResolvedValue({ success: false })
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Skicka till BOX' }))

		await waitFor(() => {
			expect(screen.getByText('Kunde inte skicka till BOX')).toBeInTheDocument()
		})
	})

	it('should dismiss result message when clicking dismiss button', async () => {
		mockSendToBox.mockResolvedValue({
			success: true,
			data: { message: 'OK' },
		})
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Skicka till BOX' }))

		await waitFor(() => {
			expect(
				screen.getByText('Tidrapporten har skickats till BOX!'),
			).toBeInTheDocument()
		})

		await user.click(screen.getByText('✕'))

		expect(
			screen.queryByText('Tidrapporten har skickats till BOX!'),
		).not.toBeInTheDocument()
	})

	it('should call sendToBox with correct year and month', async () => {
		mockSendToBox.mockResolvedValue({
			success: true,
			data: { message: 'OK' },
		})
		const user = userEvent.setup()

		renderPage()

		await waitFor(() => {
			expect(
				screen.getByRole('button', { name: 'Skicka till BOX' }),
			).toBeInTheDocument()
		})

		await user.click(screen.getByRole('button', { name: 'Skicka till BOX' }))

		expect(mockSendToBox).toHaveBeenCalledWith({ year: 2026, month: 3 })
	})
})
