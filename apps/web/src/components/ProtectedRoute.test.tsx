import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'

// Mock useAuth hook
vi.mock('../hooks/useAuth', () => ({
	useAuth: vi.fn(),
}))

import { useAuth } from '../hooks/useAuth'
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>

function renderWithRouter(
	ui: React.ReactNode,
	{ initialEntries = ['/protected'] } = {},
) {
	return render(
		<MemoryRouter initialEntries={initialEntries}>
			<Routes>
				<Route path="/login" element={<div>Login Page</div>} />
				<Route
					path="/protected"
					element={<ProtectedRoute>{ui}</ProtectedRoute>}
				/>
			</Routes>
		</MemoryRouter>,
	)
}

describe('ProtectedRoute', () => {
	it('should show loading state when isLoading is true', () => {
		mockUseAuth.mockReturnValue({
			isAuthenticated: false,
			isLoading: true,
		})

		renderWithRouter(<div>Protected Content</div>)

		expect(screen.getByText('Laddar...')).toBeInTheDocument()
		expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
	})

	it('should redirect to login when not authenticated', () => {
		mockUseAuth.mockReturnValue({
			isAuthenticated: false,
			isLoading: false,
		})

		renderWithRouter(<div>Protected Content</div>)

		expect(screen.getByText('Login Page')).toBeInTheDocument()
		expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
	})

	it('should render children when authenticated', () => {
		mockUseAuth.mockReturnValue({
			isAuthenticated: true,
			isLoading: false,
		})

		renderWithRouter(<div>Protected Content</div>)

		expect(screen.getByText('Protected Content')).toBeInTheDocument()
		expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
	})

	it('should show loading indicator with clock emoji', () => {
		mockUseAuth.mockReturnValue({
			isAuthenticated: false,
			isLoading: true,
		})

		renderWithRouter(<div>Protected Content</div>)

		// Check for the clock emoji in the loading state
		expect(document.body.textContent).toContain('\u23F1') // Timer clock
	})
})
