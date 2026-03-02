import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testUserDb } from '../test/test-user-db'

vi.mock('../lib/jwt', () => ({
	verifyAccessToken: vi.fn(),
}))

vi.mock('../lib/user-db', () => ({
	getUserDb: vi.fn(),
	UserPrismaClient: {},
}))

vi.mock('../lib/auth-db', () => ({
	authDb: {
		user: {
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}))

vi.mock('../services/box.service', () => ({
	boxService: {
		getTimeReports: vi.fn(),
		getSingleTimeReport: vi.fn(),
		updateTimeReport: vi.fn(),
	},
	BoxService: vi.fn(),
}))

const { default: reports, minutesToHHMM } = await import('./reports')

function createApp() {
	const app = new Hono()
	app.route('/api/reports', reports)
	return app
}

async function authenticateRequest(userId = 'test-user-id') {
	const { verifyAccessToken } = await import('../lib/jwt')
	const { getUserDb } = await import('../lib/user-db')

	vi.mocked(verifyAccessToken).mockResolvedValueOnce({
		userId,
		email: 'test@example.com',
	})
	vi.mocked(getUserDb).mockReturnValueOnce(testUserDb as never)
}

describe('minutesToHHMM', () => {
	it('converts 0 minutes to 00:00', () => {
		expect(minutesToHHMM(0)).toBe('00:00')
	})

	it('converts 480 minutes to 08:00', () => {
		expect(minutesToHHMM(480)).toBe('08:00')
	})

	it('converts 90 minutes to 01:30', () => {
		expect(minutesToHHMM(90)).toBe('01:30')
	})

	it('converts 5 minutes to 00:05', () => {
		expect(minutesToHHMM(5)).toBe('00:05')
	})

	it('converts 600 minutes to 10:00', () => {
		expect(minutesToHHMM(600)).toBe('10:00')
	})
})

describe('POST /api/reports/send-to-box', () => {
	let app: ReturnType<typeof createApp>

	beforeEach(() => {
		app = createApp()
		vi.restoreAllMocks()
	})

	it('returns 401 when no auth token is provided', async () => {
		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(401)
	})

	it('returns 400 when year/month are missing', async () => {
		await authenticateRequest()

		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({}),
		})
		expect(res.status).toBe(400)
	})

	it('returns 400 when user has no BOX API token', async () => {
		const { authDb } = await import('../lib/auth-db')
		vi.mocked(authDb.user.findUnique).mockResolvedValueOnce({
			boxApiToken: null,
		} as never)

		await authenticateRequest()

		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(400)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.success).toBe(false)
		expect(body.error).toContain('BOX API-token')
	})

	it('returns 404 when no BOX report found for the period', async () => {
		const { authDb } = await import('../lib/auth-db')
		const { boxService } = await import('../services/box.service')

		vi.mocked(authDb.user.findUnique).mockResolvedValueOnce({
			boxApiToken: 'test-token',
		} as never)
		vi.mocked(boxService.getTimeReports).mockResolvedValueOnce([])

		await authenticateRequest()

		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(404)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.success).toBe(false)
		expect(body.error).toContain('Ingen tidrapport hittades')
	})

	it('successfully maps local entries to BOX and sends update', async () => {
		const { authDb } = await import('../lib/auth-db')
		const { boxService } = await import('../services/box.service')

		vi.mocked(authDb.user.findUnique).mockResolvedValueOnce({
			boxApiToken: 'test-token',
		} as never)

		vi.mocked(boxService.getTimeReports).mockResolvedValueOnce([
			{
				id: 'report-1',
				date: '2024-03-01',
				usage: {
					id: 'u1',
					type: 'User',
					firstName: 'Test',
					lastName: 'User',
				},
				totalHours: 0,
			},
		])

		vi.mocked(boxService.getSingleTimeReport).mockResolvedValueOnce({
			id: 'report-1',
			date: '2024-03-01',
			usage: { id: 'u1', type: 'User', firstName: 'Test', lastName: 'User' },
			totalHours: 0,
			timeReportEntries: [
				{
					id: 'e1',
					timeReportId: 'report-1',
					usageFee: null,
					type: 'common',
					date: '2024-03-11',
					hours: '00:00',
					comment: null,
				},
				{
					id: 'e2',
					timeReportId: 'report-1',
					usageFee: null,
					type: 'common',
					date: '2024-03-12',
					hours: '00:00',
					comment: null,
				},
				{
					id: 'e3',
					timeReportId: 'report-1',
					usageFee: null,
					type: 'unspecified',
					date: '2024-03-13',
					hours: '00:00',
					comment: null,
				},
			],
		})

		const updatedReport = {
			id: 'report-1',
			date: '2024-03-01',
			usage: { id: 'u1', type: 'User', firstName: 'Test', lastName: 'User' },
			totalHours: 12,
			timeReportEntries: [],
		}
		vi.mocked(boxService.updateTimeReport).mockResolvedValueOnce(updatedReport)

		// Create local time entries
		const project = await testUserDb.project.create({
			data: {
				name: 'Test Project',
				startDate: new Date('2024-01-01'),
				isActive: true,
			},
		})
		await testUserDb.timeEntry.create({
			data: {
				projectId: project.id,
				date: new Date('2024-03-11T00:00:00.000Z'),
				minutes: 480,
			},
		})
		await testUserDb.timeEntry.create({
			data: {
				projectId: project.id,
				date: new Date('2024-03-12T00:00:00.000Z'),
				minutes: 240,
			},
		})

		await authenticateRequest()

		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(200)

		const body = (await res.json()) as { success: boolean; data: unknown }
		expect(body.success).toBe(true)

		// Verify boxService calls
		expect(boxService.getTimeReports).toHaveBeenCalledWith(
			'test-token',
			2024,
			3,
		)
		expect(boxService.getSingleTimeReport).toHaveBeenCalledWith(
			'test-token',
			'report-1',
		)

		// Verify the mapped entries sent to updateTimeReport
		const updateCall = vi.mocked(boxService.updateTimeReport).mock.calls[0]
		expect(updateCall[0]).toBe('test-token')
		expect(updateCall[1]).toBe('report-1')

		const mappedEntries = updateCall[2]
		// common entry with local data -> mapped hours
		expect(mappedEntries[0].hours).toBe('08:00')
		expect(mappedEntries[1].hours).toBe('04:00')
		// unspecified entry -> left unchanged
		expect(mappedEntries[2].hours).toBe('00:00')
		expect(mappedEntries[2].type).toBe('unspecified')
	})

	it('sets hours to 00:00 for common entries with no local data', async () => {
		const { authDb } = await import('../lib/auth-db')
		const { boxService } = await import('../services/box.service')

		vi.mocked(authDb.user.findUnique).mockResolvedValueOnce({
			boxApiToken: 'test-token',
		} as never)

		vi.mocked(boxService.getTimeReports).mockResolvedValueOnce([
			{
				id: 'report-1',
				date: '2024-06-01',
				usage: {
					id: 'u1',
					type: 'User',
					firstName: 'Test',
					lastName: 'User',
				},
				totalHours: 0,
			},
		])

		vi.mocked(boxService.getSingleTimeReport).mockResolvedValueOnce({
			id: 'report-1',
			date: '2024-06-01',
			usage: { id: 'u1', type: 'User', firstName: 'Test', lastName: 'User' },
			totalHours: 0,
			timeReportEntries: [
				{
					id: 'e1',
					timeReportId: 'report-1',
					usageFee: null,
					type: 'common',
					date: '2024-06-03',
					hours: '00:00',
					comment: null,
				},
			],
		})

		vi.mocked(boxService.updateTimeReport).mockResolvedValueOnce({
			id: 'report-1',
			date: '2024-06-01',
			usage: { id: 'u1', type: 'User', firstName: 'Test', lastName: 'User' },
			totalHours: 0,
			timeReportEntries: [],
		})

		await authenticateRequest()

		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 6 }),
		})
		expect(res.status).toBe(200)

		const updateCall = vi.mocked(boxService.updateTimeReport).mock.calls[0]
		const mappedEntries = updateCall[2]
		expect(mappedEntries[0].hours).toBe('00:00')
	})

	it('returns 500 when BOX API throws an error', async () => {
		const { authDb } = await import('../lib/auth-db')
		const { boxService } = await import('../services/box.service')

		vi.mocked(authDb.user.findUnique).mockResolvedValueOnce({
			boxApiToken: 'test-token',
		} as never)

		vi.mocked(boxService.getTimeReports).mockRejectedValueOnce(
			new Error('BOX API returnerade HTTP 500: Internal Server Error'),
		)

		await authenticateRequest()

		const res = await app.request('/api/reports/send-to-box', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(500)
	})
})
