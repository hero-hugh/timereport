const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

interface ApiResponse<T> {
	success: boolean
	data?: T
	error?: string
}

class ApiClient {
	private baseUrl: string

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl
	}

	private async request<T>(
		endpoint: string,
		options: RequestInit = {},
	): Promise<ApiResponse<T>> {
		const url = `${this.baseUrl}${endpoint}`

		const config: RequestInit = {
			...options,
			credentials: 'include', // För cookies
			headers: {
				'Content-Type': 'application/json',
				...options.headers,
			},
		}

		try {
			const response = await fetch(url, config)

			// Försök refresh token om 401
			if (response.status === 401 && !endpoint.includes('/auth/')) {
				const refreshed = await this.refreshToken()
				if (refreshed) {
					// Försök igen
					const retryResponse = await fetch(url, config)
					return retryResponse.json()
				}
			}

			return response.json()
		} catch (error) {
			return {
				success: false,
				error: 'Kunde inte ansluta till servern',
			}
		}
	}

	private async refreshToken(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/api/auth/refresh`, {
				method: 'POST',
				credentials: 'include',
			})
			const data = await response.json()
			return data.success
		} catch {
			return false
		}
	}

	// Auth
	async requestOtp(email: string) {
		return this.request<{ message: string }>('/api/auth/request-otp', {
			method: 'POST',
			body: JSON.stringify({ email }),
		})
	}

	async verifyOtp(email: string, code: string) {
		return this.request<{
			user: { id: string; email: string; name: string | null }
		}>('/api/auth/verify-otp', {
			method: 'POST',
			body: JSON.stringify({ email, code }),
		})
	}

	async logout() {
		return this.request<{ message: string }>('/api/auth/logout', {
			method: 'POST',
		})
	}

	async getMe() {
		return this.request<{
			id: string
			email: string
			name: string | null
			createdAt: string
			updatedAt: string
		}>('/api/auth/me')
	}

	// Projects
	async getProjects(includeInactive = false) {
		const query = includeInactive ? '?includeInactive=true' : ''
		return this.request<
			Array<{
				id: string
				name: string
				description: string | null
				hourlyRate: number | null
				startDate: string
				endDate: string | null
				isActive: boolean
				totalMinutes: number
				totalAmount: number | null
			}>
		>(`/api/projects${query}`)
	}

	async getProject(id: string) {
		return this.request<{
			id: string
			name: string
			description: string | null
			hourlyRate: number | null
			startDate: string
			endDate: string | null
			isActive: boolean
			totalMinutes: number
			totalAmount: number | null
		}>(`/api/projects/${id}`)
	}

	async createProject(data: {
		name: string
		description?: string
		hourlyRate?: number
		startDate: string
		endDate?: string | null
	}) {
		return this.request<{ id: string }>('/api/projects', {
			method: 'POST',
			body: JSON.stringify(data),
		})
	}

	async updateProject(
		id: string,
		data: {
			name?: string
			description?: string
			hourlyRate?: number
			startDate?: string
			endDate?: string | null
			isActive?: boolean
		},
	) {
		return this.request<{ id: string }>(`/api/projects/${id}`, {
			method: 'PATCH',
			body: JSON.stringify(data),
		})
	}

	async deleteProject(id: string) {
		return this.request<{ message: string }>(`/api/projects/${id}`, {
			method: 'DELETE',
		})
	}

	// Time entries
	async getTimeEntries(params?: {
		projectId?: string
		from?: string
		to?: string
	}) {
		const query = new URLSearchParams()
		if (params?.projectId) query.set('projectId', params.projectId)
		if (params?.from) query.set('from', params.from)
		if (params?.to) query.set('to', params.to)

		const queryString = query.toString()
		return this.request<
			Array<{
				id: string
				projectId: string
				date: string
				minutes: number
				description: string | null
				project: {
					id: string
					name: string
					hourlyRate: number | null
				}
			}>
		>(`/api/time-entries${queryString ? `?${queryString}` : ''}`)
	}

	async getWeekEntries(date?: string) {
		const query = date ? `?date=${date}` : ''
		return this.request<{
			data: Array<{
				id: string
				projectId: string
				date: string
				minutes: number
				description: string | null
				project: {
					id: string
					name: string
					hourlyRate: number | null
					isActive: boolean
				}
			}>
			weekStart: string
		}>(`/api/time-entries/week${query}`)
	}

	async createOrUpdateTimeEntry(data: {
		projectId: string
		date: string
		minutes: number
		description?: string
	}) {
		return this.request<{ id: string }>('/api/time-entries', {
			method: 'POST',
			body: JSON.stringify(data),
		})
	}

	async deleteTimeEntry(id: string) {
		return this.request<{ message: string }>(`/api/time-entries/${id}`, {
			method: 'DELETE',
		})
	}

	// Reports
	async getReportSummary(params: {
		from: string
		to: string
		projectId?: string
	}) {
		const query = new URLSearchParams({
			from: params.from,
			to: params.to,
		})
		if (params.projectId) query.set('projectId', params.projectId)

		return this.request<{
			totalMinutes: number
			totalAmount: number
			projects: Array<{
				projectId: string
				projectName: string
				hourlyRate: number | null
				totalMinutes: number
				totalAmount: number | null
			}>
			period: { from: string; to: string }
		}>(`/api/reports/summary?${query}`)
	}

	async getDashboardStats() {
		return this.request<{
			weekMinutes: number
			monthMinutes: number
			monthTotalMinutes: number
			activeProjectsCount: number
			recentEntries: Array<{
				id: string
				date: string
				minutes: number
				project: { id: string; name: string }
			}>
		}>('/api/reports/dashboard')
	}

	// PDF
	async downloadPdfReport(params: { year: number; month: number }) {
		const query = new URLSearchParams({
			year: String(params.year),
			month: String(params.month),
		})
		const url = `${this.baseUrl}/api/reports/pdf?${query}`

		const response = await fetch(url, { credentials: 'include' })

		if (response.status === 401) {
			const refreshed = await this.refreshToken()
			if (refreshed) {
				const retryResponse = await fetch(url, { credentials: 'include' })
				if (!retryResponse.ok) {
					return { success: false as const, error: 'Kunde inte generera PDF' }
				}
				return { success: true as const, blob: await retryResponse.blob() }
			}
			return { success: false as const, error: 'Ej inloggad' }
		}

		if (!response.ok) {
			return { success: false as const, error: 'Kunde inte generera PDF' }
		}

		return { success: true as const, blob: await response.blob() }
	}

	// Holidays
	async getHolidays(params: { from: string; to: string }) {
		const query = new URLSearchParams({
			from: params.from,
			to: params.to,
		})
		return this.request<{
			holidays: Array<{
				date: string
				name: string
				type: 'public' | 'flag'
			}>
			period: { from: string; to: string }
		}>(`/api/holidays?${query}`)
	}
}

export const api = new ApiClient(API_URL)
