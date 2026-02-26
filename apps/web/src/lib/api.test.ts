import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We need to test the ApiClient class, so we'll create a new instance for testing
const API_URL = 'http://localhost:3000'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper to create the api client fresh for each test
async function createApiClient() {
	// Reset module cache and reimport
	vi.resetModules()
	const { api } = await import('./api')
	return api
}

describe('ApiClient', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockFetch.mockReset()
	})

	afterEach(() => {
		vi.resetModules()
	})

	describe('request handling', () => {
		it('should make requests with correct headers and credentials', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: { message: 'ok' } }),
			})

			const api = await createApiClient()
			await api.requestOtp('test@example.com')

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/auth/request-otp`,
				expect.objectContaining({
					method: 'POST',
					credentials: 'include',
					headers: expect.objectContaining({
						'Content-Type': 'application/json',
					}),
					body: JSON.stringify({ email: 'test@example.com' }),
				}),
			)
		})

		it('should handle network errors', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'))

			const api = await createApiClient()
			const result = await api.requestOtp('test@example.com')

			expect(result).toEqual({
				success: false,
				error: 'Kunde inte ansluta till servern',
			})
		})

		it('should attempt token refresh on 401 for non-auth endpoints', async () => {
			// First call returns 401
			mockFetch
				.mockResolvedValueOnce({
					status: 401,
					json: () => Promise.resolve({ success: false }),
				})
				// Refresh token call
				.mockResolvedValueOnce({
					status: 200,
					json: () => Promise.resolve({ success: true }),
				})
				// Retry call
				.mockResolvedValueOnce({
					status: 200,
					json: () => Promise.resolve({ success: true, data: [] }),
				})

			const api = await createApiClient()
			const result = await api.getProjects()

			expect(mockFetch).toHaveBeenCalledTimes(3)
			expect(mockFetch).toHaveBeenNthCalledWith(
				2,
				`${API_URL}/api/auth/refresh`,
				expect.objectContaining({ method: 'POST', credentials: 'include' }),
			)
			expect(result.success).toBe(true)
		})

		it('should not attempt token refresh for auth endpoints', async () => {
			mockFetch.mockResolvedValue({
				status: 401,
				json: () => Promise.resolve({ success: false, error: 'Unauthorized' }),
			})

			const api = await createApiClient()
			const result = await api.verifyOtp('test@example.com', '123456')

			// Should only call once, no refresh attempt
			expect(mockFetch).toHaveBeenCalledTimes(1)
			expect(result.success).toBe(false)
		})
	})

	describe('auth endpoints', () => {
		it('should request OTP', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({ success: true, data: { message: 'OTP skickad' } }),
			})

			const api = await createApiClient()
			const result = await api.requestOtp('test@example.com')

			expect(result.success).toBe(true)
			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/auth/request-otp`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ email: 'test@example.com' }),
				}),
			)
		})

		it('should verify OTP', async () => {
			const mockUser = { id: '1', email: 'test@example.com', name: null }
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({ success: true, data: { user: mockUser } }),
			})

			const api = await createApiClient()
			const result = await api.verifyOtp('test@example.com', '123456')

			expect(result.success).toBe(true)
			expect(result.data?.user).toEqual(mockUser)
			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/auth/verify-otp`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify({ email: 'test@example.com', code: '123456' }),
				}),
			)
		})

		it('should logout', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({ success: true, data: { message: 'Utloggad' } }),
			})

			const api = await createApiClient()
			const result = await api.logout()

			expect(result.success).toBe(true)
			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/auth/logout`,
				expect.objectContaining({ method: 'POST' }),
			)
		})

		it('should get current user', async () => {
			const mockUser = {
				id: '1',
				email: 'test@example.com',
				name: 'Test',
				createdAt: '2024-01-01',
				updatedAt: '2024-01-01',
			}
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: mockUser }),
			})

			const api = await createApiClient()
			const result = await api.getMe()

			expect(result.success).toBe(true)
			expect(result.data).toEqual(mockUser)
		})
	})

	describe('project endpoints', () => {
		it('should get projects without inactive', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: [] }),
			})

			const api = await createApiClient()
			await api.getProjects()

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/projects`,
				expect.any(Object),
			)
		})

		it('should get projects with inactive', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: [] }),
			})

			const api = await createApiClient()
			await api.getProjects(true)

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/projects?includeInactive=true`,
				expect.any(Object),
			)
		})

		it('should get single project', async () => {
			const mockProject = { id: '123', name: 'Test Project' }
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: mockProject }),
			})

			const api = await createApiClient()
			const result = await api.getProject('123')

			expect(result.success).toBe(true)
			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/projects/123`,
				expect.any(Object),
			)
		})

		it('should create project', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: { id: 'new-id' } }),
			})

			const api = await createApiClient()
			const projectData = {
				name: 'New Project',
				startDate: '2024-01-01',
				hourlyRate: 85000,
			}
			await api.createProject(projectData)

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/projects`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify(projectData),
				}),
			)
		})

		it('should update project', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: { id: '123' } }),
			})

			const api = await createApiClient()
			await api.updateProject('123', { name: 'Updated Name' })

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/projects/123`,
				expect.objectContaining({
					method: 'PATCH',
					body: JSON.stringify({ name: 'Updated Name' }),
				}),
			)
		})

		it('should delete project', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({ success: true, data: { message: 'Deleted' } }),
			})

			const api = await createApiClient()
			await api.deleteProject('123')

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/projects/123`,
				expect.objectContaining({ method: 'DELETE' }),
			)
		})
	})

	describe('time entry endpoints', () => {
		it('should get time entries without filters', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: [] }),
			})

			const api = await createApiClient()
			await api.getTimeEntries()

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/time-entries`,
				expect.any(Object),
			)
		})

		it('should get time entries with filters', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: [] }),
			})

			const api = await createApiClient()
			await api.getTimeEntries({
				projectId: 'proj-1',
				from: '2024-01-01',
				to: '2024-01-31',
			})

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/time-entries?projectId=proj-1&from=2024-01-01&to=2024-01-31`,
				expect.any(Object),
			)
		})

		it('should get week entries', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({
						success: true,
						data: { data: [], weekStart: '2024-01-01' },
					}),
			})

			const api = await createApiClient()
			await api.getWeekEntries('2024-01-03')

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/time-entries/week?date=2024-01-03`,
				expect.any(Object),
			)
		})

		it('should create or update time entry', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: { id: 'entry-1' } }),
			})

			const api = await createApiClient()
			const entryData = {
				projectId: 'proj-1',
				date: '2024-01-15',
				minutes: 480,
				description: 'Worked on feature',
			}
			await api.createOrUpdateTimeEntry(entryData)

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/time-entries`,
				expect.objectContaining({
					method: 'POST',
					body: JSON.stringify(entryData),
				}),
			)
		})

		it('should delete time entry', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({ success: true, data: { message: 'Deleted' } }),
			})

			const api = await createApiClient()
			await api.deleteTimeEntry('entry-1')

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/time-entries/entry-1`,
				expect.objectContaining({ method: 'DELETE' }),
			)
		})
	})

	describe('report endpoints', () => {
		it('should get report summary', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({
						success: true,
						data: { totalMinutes: 0, totalAmount: 0, projects: [] },
					}),
			})

			const api = await createApiClient()
			await api.getReportSummary({
				from: '2024-01-01',
				to: '2024-01-31',
			})

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/reports/summary?from=2024-01-01&to=2024-01-31`,
				expect.any(Object),
			)
		})

		it('should get report summary with project filter', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () => Promise.resolve({ success: true, data: {} }),
			})

			const api = await createApiClient()
			await api.getReportSummary({
				from: '2024-01-01',
				to: '2024-01-31',
				projectId: 'proj-1',
			})

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/reports/summary?from=2024-01-01&to=2024-01-31&projectId=proj-1`,
				expect.any(Object),
			)
		})

		it('should get dashboard stats', async () => {
			mockFetch.mockResolvedValue({
				status: 200,
				json: () =>
					Promise.resolve({
						success: true,
						data: {
							weekMinutes: 0,
							monthMinutes: 0,
							activeProjectsCount: 0,
							recentEntries: [],
						},
					}),
			})

			const api = await createApiClient()
			await api.getDashboardStats()

			expect(mockFetch).toHaveBeenCalledWith(
				`${API_URL}/api/reports/dashboard`,
				expect.any(Object),
			)
		})
	})
})
