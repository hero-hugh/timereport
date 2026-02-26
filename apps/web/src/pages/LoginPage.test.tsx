import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Use vi.hoisted to create mocks that can be used in vi.mock factories
const { mockLogin, mockRequestOtp } = vi.hoisted(() => ({
	mockLogin: vi.fn(),
	mockRequestOtp: vi.fn(),
}))

// Mock dependencies
vi.mock('../hooks/useAuth', () => ({
	useAuth: () => ({
		login: mockLogin,
	}),
}))

vi.mock('../lib/api', () => ({
	api: {
		requestOtp: mockRequestOtp,
	},
}))

// Import component after mocks are set up
import { LoginPage } from './LoginPage'

function renderLoginPage() {
	return render(
		<MemoryRouter initialEntries={['/login']}>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/" element={<div>Dashboard</div>} />
			</Routes>
		</MemoryRouter>,
	)
}

describe('LoginPage', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe('email step', () => {
		it('should render email input initially', () => {
			renderLoginPage()

			expect(screen.getByText('Tidrapportering')).toBeInTheDocument()
			expect(
				screen.getByText('Ange din e-postadress för att logga in'),
			).toBeInTheDocument()
			expect(screen.getByLabelText('E-post')).toBeInTheDocument()
			expect(
				screen.getByRole('button', { name: 'Skicka kod' }),
			).toBeInTheDocument()
		})

		it('should request OTP when email is submitted', async () => {
			mockRequestOtp.mockResolvedValue({ success: true })
			const user = userEvent.setup()

			renderLoginPage()

			await user.type(screen.getByLabelText('E-post'), 'test@example.com')
			await user.click(screen.getByRole('button', { name: 'Skicka kod' }))

			expect(mockRequestOtp).toHaveBeenCalledWith('test@example.com')
		})

		it('should show loading state while requesting OTP', async () => {
			mockRequestOtp.mockImplementation(
				() => new Promise((resolve) => setTimeout(resolve, 100)),
			)
			const user = userEvent.setup()

			renderLoginPage()

			await user.type(screen.getByLabelText('E-post'), 'test@example.com')
			await user.click(screen.getByRole('button', { name: 'Skicka kod' }))

			expect(screen.getByRole('button', { name: 'Skickar...' })).toBeDisabled()
		})

		it('should show error when OTP request fails', async () => {
			mockRequestOtp.mockResolvedValue({
				success: false,
				error: 'Ogiltig e-postadress',
			})
			const user = userEvent.setup()

			renderLoginPage()

			// Need a valid email format to pass browser validation
			await user.type(screen.getByLabelText('E-post'), 'test@example.com')
			await user.click(screen.getByRole('button', { name: 'Skicka kod' }))

			await waitFor(() => {
				expect(screen.getByText('Ogiltig e-postadress')).toBeInTheDocument()
			})
		})

		it('should show default error message when no error provided', async () => {
			mockRequestOtp.mockResolvedValue({ success: false })
			const user = userEvent.setup()

			renderLoginPage()

			await user.type(screen.getByLabelText('E-post'), 'test@example.com')
			await user.click(screen.getByRole('button', { name: 'Skicka kod' }))

			await waitFor(() => {
				expect(screen.getByText('Kunde inte skicka kod')).toBeInTheDocument()
			})
		})

		it('should proceed to OTP step on successful request', async () => {
			mockRequestOtp.mockResolvedValue({ success: true })
			const user = userEvent.setup()

			renderLoginPage()

			await user.type(screen.getByLabelText('E-post'), 'test@example.com')
			await user.click(screen.getByRole('button', { name: 'Skicka kod' }))

			await waitFor(() => {
				expect(
					screen.getByText('Vi skickade en kod till test@example.com'),
				).toBeInTheDocument()
				expect(screen.getByText('6-siffrig kod')).toBeInTheDocument()
				expect(
					screen.getByRole('button', { name: 'Verifiera' }),
				).toBeInTheDocument()
			})
		})
	})

	describe('OTP step', () => {
		async function goToOtpStep() {
			mockRequestOtp.mockResolvedValue({ success: true })
			const user = userEvent.setup()

			renderLoginPage()

			await user.type(screen.getByLabelText('E-post'), 'test@example.com')
			await user.click(screen.getByRole('button', { name: 'Skicka kod' }))

			await waitFor(() => {
				expect(screen.getByText('6-siffrig kod')).toBeInTheDocument()
			})

			return user
		}

		// Helper to get the OTP input (it's a textbox role)
		function getOtpInput() {
			return screen.getByRole('textbox')
		}

		it('should show OTP input component', async () => {
			await goToOtpStep()

			// InputOTP renders as a textbox
			expect(getOtpInput()).toBeInTheDocument()
		})

		it('should disable verify button initially', async () => {
			await goToOtpStep()

			const verifyButton = screen.getByRole('button', { name: 'Verifiera' })
			expect(verifyButton).toBeDisabled()
		})

		it('should enable verify button when 6 digits entered', async () => {
			const user = await goToOtpStep()

			const otpInput = getOtpInput()
			await user.type(otpInput, '123456')

			await waitFor(() => {
				const verifyButton = screen.getByRole('button', { name: 'Verifiera' })
				expect(verifyButton).not.toBeDisabled()
			})
		})

		it('should auto-submit and call login when 6 digits entered', async () => {
			mockLogin.mockResolvedValue({ success: true })
			const user = await goToOtpStep()

			const otpInput = getOtpInput()
			await user.type(otpInput, '123456')

			// onComplete triggers auto-submit
			await waitFor(() => {
				expect(mockLogin).toHaveBeenCalledWith('test@example.com', '123456')
			})
		})

		it('should navigate to dashboard on successful login', async () => {
			mockLogin.mockResolvedValue({ success: true })
			const user = await goToOtpStep()

			const otpInput = getOtpInput()
			await user.type(otpInput, '123456')

			await waitFor(() => {
				expect(screen.getByText('Dashboard')).toBeInTheDocument()
			})
		})

		it('should show error on failed login', async () => {
			mockLogin.mockResolvedValue({ success: false, error: 'Fel kod' })
			const user = await goToOtpStep()

			const otpInput = getOtpInput()
			await user.type(otpInput, '000000')

			await waitFor(() => {
				expect(screen.getByText('Fel kod')).toBeInTheDocument()
			})
		})

		it('should show default error when no error message provided', async () => {
			mockLogin.mockResolvedValue({ success: false })
			const user = await goToOtpStep()

			const otpInput = getOtpInput()
			await user.type(otpInput, '000000')

			await waitFor(() => {
				expect(screen.getByText('Felaktig kod')).toBeInTheDocument()
			})
		})

		it('should go back to email step when clicking back button', async () => {
			const user = await goToOtpStep()

			await user.click(screen.getByRole('button', { name: 'Tillbaka' }))

			expect(
				screen.getByText('Ange din e-postadress för att logga in'),
			).toBeInTheDocument()
			expect(screen.getByLabelText('E-post')).toBeInTheDocument()
		})

		it('should clear error when going back', async () => {
			mockLogin.mockResolvedValue({ success: false, error: 'Fel kod' })
			const user = await goToOtpStep()

			const otpInput = getOtpInput()
			await user.type(otpInput, '000000')

			await waitFor(() => {
				expect(screen.getByText('Fel kod')).toBeInTheDocument()
			})

			// Go back
			await user.click(screen.getByRole('button', { name: 'Tillbaka' }))

			// Error should be cleared
			expect(screen.queryByText('Fel kod')).not.toBeInTheDocument()
		})
	})
})
