import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from './useAuth'

// Mock the API module
vi.mock('../lib/api', () => ({
	api: {
		getMe: vi.fn(),
		verifyOtp: vi.fn(),
		logout: vi.fn(),
	},
}))

import { api } from '../lib/api'

const mockApi = api as {
	getMe: ReturnType<typeof vi.fn>
	verifyOtp: ReturnType<typeof vi.fn>
	logout: ReturnType<typeof vi.fn>
}

function wrapper({ children }: { children: ReactNode }) {
	return <AuthProvider>{children}</AuthProvider>
}

describe('useAuth', () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.resetAllMocks()
	})

	describe('initial state', () => {
		it('should start with loading true and no user', async () => {
			mockApi.getMe.mockResolvedValue({ success: false })

			const { result } = renderHook(() => useAuth(), { wrapper })

			expect(result.current.isLoading).toBe(true)
			expect(result.current.user).toBe(null)
			expect(result.current.isAuthenticated).toBe(false)

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})
		})

		it('should fetch user on mount', async () => {
			const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' }
			mockApi.getMe.mockResolvedValue({
				success: true,
				data: mockUser,
			})

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})

			expect(mockApi.getMe).toHaveBeenCalled()
			expect(result.current.user).toEqual(mockUser)
			expect(result.current.isAuthenticated).toBe(true)
		})

		it('should handle failed user fetch', async () => {
			mockApi.getMe.mockResolvedValue({ success: false, error: 'Unauthorized' })

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})

			expect(result.current.user).toBe(null)
			expect(result.current.isAuthenticated).toBe(false)
		})

		it('should handle network error on user fetch', async () => {
			mockApi.getMe.mockRejectedValue(new Error('Network error'))

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})

			expect(result.current.user).toBe(null)
			expect(result.current.isAuthenticated).toBe(false)
		})
	})

	describe('login', () => {
		beforeEach(() => {
			mockApi.getMe.mockResolvedValue({ success: false })
		})

		it('should login successfully', async () => {
			const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' }
			mockApi.verifyOtp.mockResolvedValue({
				success: true,
				data: { user: mockUser },
			})

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})

			let loginResult: { success: boolean; error?: string }
			await act(async () => {
				loginResult = await result.current.login('test@example.com', '123456')
			})

			expect(loginResult!.success).toBe(true)
			expect(result.current.user).toEqual(mockUser)
			expect(result.current.isAuthenticated).toBe(true)
			expect(mockApi.verifyOtp).toHaveBeenCalledWith(
				'test@example.com',
				'123456',
			)
		})

		it('should handle login failure with error message', async () => {
			mockApi.verifyOtp.mockResolvedValue({
				success: false,
				error: 'Fel kod',
			})

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})

			let loginResult: { success: boolean; error?: string }
			await act(async () => {
				loginResult = await result.current.login('test@example.com', '000000')
			})

			expect(loginResult!.success).toBe(false)
			expect(loginResult!.error).toBe('Fel kod')
			expect(result.current.user).toBe(null)
		})

		it('should use default error message if none provided', async () => {
			mockApi.verifyOtp.mockResolvedValue({
				success: false,
			})

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isLoading).toBe(false)
			})

			let loginResult: { success: boolean; error?: string }
			await act(async () => {
				loginResult = await result.current.login('test@example.com', '000000')
			})

			expect(loginResult!.success).toBe(false)
			expect(loginResult!.error).toBe('Inloggning misslyckades')
		})
	})

	describe('logout', () => {
		it('should logout and clear user', async () => {
			const mockUser = { id: '1', email: 'test@example.com', name: 'Test User' }
			mockApi.getMe.mockResolvedValue({
				success: true,
				data: mockUser,
			})
			mockApi.logout.mockResolvedValue({ success: true })

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.isAuthenticated).toBe(true)
			})

			await act(async () => {
				await result.current.logout()
			})

			expect(mockApi.logout).toHaveBeenCalled()
			expect(result.current.user).toBe(null)
			expect(result.current.isAuthenticated).toBe(false)
		})
	})

	describe('refreshUser', () => {
		it('should refresh user data', async () => {
			const initialUser = {
				id: '1',
				email: 'test@example.com',
				name: 'Initial',
			}
			const updatedUser = {
				id: '1',
				email: 'test@example.com',
				name: 'Updated',
			}

			mockApi.getMe
				.mockResolvedValueOnce({ success: true, data: initialUser })
				.mockResolvedValueOnce({ success: true, data: updatedUser })

			const { result } = renderHook(() => useAuth(), { wrapper })

			await waitFor(() => {
				expect(result.current.user?.name).toBe('Initial')
			})

			await act(async () => {
				await result.current.refreshUser()
			})

			expect(result.current.user?.name).toBe('Updated')
		})
	})

	describe('useAuth outside provider', () => {
		it('should throw error when used outside AuthProvider', () => {
			// Suppress console.error for this test
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

			expect(() => {
				renderHook(() => useAuth())
			}).toThrow('useAuth must be used within an AuthProvider')

			consoleSpy.mockRestore()
		})
	})
})
