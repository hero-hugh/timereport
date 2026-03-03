import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authDb } from '../lib/auth-db'
import {
	BoxApiError,
	type BoxTimeReport,
	type TimeReportNode,
} from '../lib/box-client'
import { testUserDb } from '../test/test-user-db'

vi.mock('../lib/jwt', () => ({
	verifyAccessToken: vi.fn(),
}))

vi.mock('../lib/user-db', () => ({
	getUserDb: vi.fn(),
	UserPrismaClient: {},
}))

vi.mock('../lib/box-client', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../lib/box-client')>()
	return {
		...actual,
		getTimeReports: vi.fn(),
		getSingleTimeReport: vi.fn(),
		updateTimeReport: vi.fn(),
	}
})

const { default: boxSync } = await import('./box-sync')

function createApp() {
	const app = new Hono()
	app.route('/api/box', boxSync)
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

async function createTestUserWithToken(
	id = 'test-user-id',
	token: string | null = 'box-api-token-123',
) {
	return authDb.user.create({
		data: {
			id,
			email: `${id}@example.com`,
			boxApiToken: token,
		},
	})
}

const MOCK_BOX_LISTING_REPORT: TimeReportNode = {
	id: 'box-report-1',
	date: '2024-03-01',
	totalHours: '00:00',
	usage: 0,
}

const MOCK_BOX_REPORT: BoxTimeReport = {
	id: 'box-report-1',
	date: '2024-03-01',
	totalHours: '00:00',
	timeReportEntries: [
		{
			id: 'entry-1',
			type: 'common',
			date: '2024-03-11',
			hours: '00:00',
			comment: null,
		},
		{
			id: 'entry-2',
			type: 'common',
			date: '2024-03-12',
			hours: '00:00',
			comment: null,
		},
		{
			id: 'entry-3',
			type: 'unspecified',
			date: '2024-03-13',
			hours: '08:00',
			comment: 'Semester',
		},
	],
}

describe('POST /api/box/sync', () => {
	let app: ReturnType<typeof createApp>

	beforeEach(() => {
		app = createApp()
		vi.restoreAllMocks()
	})

	it('returns 401 when not authenticated', async () => {
		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(401)
	})

	it('returns 400 when body is invalid', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 'bad', month: 13 }),
		})
		expect(res.status).toBe(400)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.success).toBe(false)
	})

	it('returns 400 when user has no BOX token', async () => {
		await authDb.user.create({
			data: { id: 'no-token-user', email: 'no-token@example.com' },
		})
		await authenticateRequest('no-token-user')

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(400)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.error).toBe(
			'BOX API token saknas - konfigurera i API inställningar',
		)
	})

	it('returns 404 when no BOX report exists for the period', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		const { getTimeReports } = await import('../lib/box-client')
		vi.mocked(getTimeReports).mockResolvedValueOnce([])

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(404)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.error).toBe('Ingen tidrapport hittades i BOX för denna period')
	})

	it('syncs local time entries to BOX report successfully', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		// Create local project and time entries
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
				description: 'Backend work',
			},
		})
		await testUserDb.timeEntry.create({
			data: {
				projectId: project.id,
				date: new Date('2024-03-12T00:00:00.000Z'),
				minutes: 240,
				description: 'Frontend work',
			},
		})

		const { getTimeReports, getSingleTimeReport, updateTimeReport } =
			await import('../lib/box-client')
		vi.mocked(getTimeReports).mockResolvedValueOnce([MOCK_BOX_LISTING_REPORT])
		vi.mocked(getSingleTimeReport).mockResolvedValueOnce(MOCK_BOX_REPORT)
		vi.mocked(updateTimeReport).mockResolvedValueOnce(MOCK_BOX_REPORT)

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(200)

		const body = (await res.json()) as {
			success: boolean
			data: { message: string }
		}
		expect(body.success).toBe(true)
		expect(body.data.message).toBe('Tidrapport skickad till BOX')

		// Verify updateTimeReport was called with correct mapped entries
		expect(vi.mocked(updateTimeReport)).toHaveBeenCalledOnce()
		const [token, reportId, entries] = vi.mocked(updateTimeReport).mock.calls[0]
		expect(token).toBe('box-api-token-123')
		expect(reportId).toBe('box-report-1')

		// entry-1 (2024-03-11) → 08:00 from 480 minutes
		expect(entries[0]).toEqual({
			id: 'entry-1',
			type: 'common',
			date: '2024-03-11',
			hours: '08:00',
			comment: 'Backend work',
		})

		// entry-2 (2024-03-12) → 04:00 from 240 minutes
		expect(entries[1]).toEqual({
			id: 'entry-2',
			type: 'common',
			date: '2024-03-12',
			hours: '04:00',
			comment: 'Frontend work',
		})

		// entry-3 (unspecified type) → unchanged
		expect(entries[2]).toEqual({
			id: 'entry-3',
			type: 'unspecified',
			date: '2024-03-13',
			hours: '08:00',
			comment: 'Semester',
		})
	})

	it('sets hours to 00:00 for common entries with no local data', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		// No local time entries for March 2024

		const boxReportListing: TimeReportNode = {
			id: 'box-report-2',
			date: '2024-03-01',
			totalHours: '08:00',
			usage: 0,
		}

		const boxReportWithCommon: BoxTimeReport = {
			id: 'box-report-2',
			date: '2024-03-01',
			totalHours: '08:00',
			timeReportEntries: [
				{
					id: 'entry-a',
					type: 'common',
					date: '2024-03-11',
					hours: '08:00',
					comment: 'Old entry',
				},
			],
		}

		const { getTimeReports, getSingleTimeReport, updateTimeReport } =
			await import('../lib/box-client')
		vi.mocked(getTimeReports).mockResolvedValueOnce([boxReportListing])
		vi.mocked(getSingleTimeReport).mockResolvedValueOnce(boxReportWithCommon)
		vi.mocked(updateTimeReport).mockResolvedValueOnce(boxReportWithCommon)

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(200)

		const [, , entries] = vi.mocked(updateTimeReport).mock.calls[0]
		expect(entries[0]).toEqual({
			id: 'entry-a',
			type: 'common',
			date: '2024-03-11',
			hours: '00:00',
			comment: 'Old entry',
		})
	})

	it('returns 502 with Swedish message when BOX API has network error', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		const { getTimeReports } = await import('../lib/box-client')
		vi.mocked(getTimeReports).mockRejectedValueOnce(
			new BoxApiError('Network error: fetch failed'),
		)

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(502)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.success).toBe(false)
		expect(body.error).toBe('Nätverksfel - försök igen')
		expect(consoleSpy).toHaveBeenCalledWith(
			'BOX API error fetching time reports:',
			'Network error: fetch failed',
		)
		consoleSpy.mockRestore()
	})

	it('returns 502 with auth error message for 401 status', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		const { getTimeReports } = await import('../lib/box-client')
		vi.mocked(getTimeReports).mockRejectedValueOnce(
			new BoxApiError('BOX API returned status 401'),
		)

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(502)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.error).toBe(
			'BOX API token ogiltigt - kontrollera token i API inställningar',
		)
		consoleSpy.mockRestore()
	})

	it('returns 502 with time format error for hours validation', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		const { getTimeReports, getSingleTimeReport, updateTimeReport } =
			await import('../lib/box-client')
		vi.mocked(getTimeReports).mockResolvedValueOnce([MOCK_BOX_LISTING_REPORT])
		vi.mocked(getSingleTimeReport).mockResolvedValueOnce(MOCK_BOX_REPORT)
		vi.mocked(updateTimeReport).mockRejectedValueOnce(
			new BoxApiError('Invalid hours format'),
		)

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(502)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.error).toBe('Ett fel uppstod med tidsformatet')
		consoleSpy.mockRestore()
	})

	it('returns 502 with BOX error message for other GraphQL errors', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		const { getTimeReports } = await import('../lib/box-client')
		vi.mocked(getTimeReports).mockRejectedValueOnce(
			new BoxApiError('Some unexpected GraphQL error'),
		)

		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(502)

		const body = (await res.json()) as { success: boolean; error: string }
		expect(body.error).toBe('Some unexpected GraphQL error')
		consoleSpy.mockRestore()
	})

	it('aggregates multiple local entries for the same date', async () => {
		await createTestUserWithToken()
		await authenticateRequest()

		// Create two projects with entries on the same date
		const project1 = await testUserDb.project.create({
			data: {
				name: 'Project A',
				startDate: new Date('2024-01-01'),
				isActive: true,
			},
		})
		const project2 = await testUserDb.project.create({
			data: {
				name: 'Project B',
				startDate: new Date('2024-01-01'),
				isActive: true,
			},
		})
		await testUserDb.timeEntry.create({
			data: {
				projectId: project1.id,
				date: new Date('2024-03-11T00:00:00.000Z'),
				minutes: 240,
				description: 'Morning work',
			},
		})
		await testUserDb.timeEntry.create({
			data: {
				projectId: project2.id,
				date: new Date('2024-03-11T00:00:00.000Z'),
				minutes: 180,
				description: 'Afternoon work',
			},
		})

		const boxReportListing: TimeReportNode = {
			id: 'box-report-3',
			date: '2024-03-01',
			totalHours: '00:00',
			usage: 0,
		}

		const boxReport: BoxTimeReport = {
			id: 'box-report-3',
			date: '2024-03-01',
			totalHours: '00:00',
			timeReportEntries: [
				{
					id: 'entry-x',
					type: 'common',
					date: '2024-03-11',
					hours: '00:00',
					comment: null,
				},
			],
		}

		const { getTimeReports, getSingleTimeReport, updateTimeReport } =
			await import('../lib/box-client')
		vi.mocked(getTimeReports).mockResolvedValueOnce([boxReportListing])
		vi.mocked(getSingleTimeReport).mockResolvedValueOnce(boxReport)
		vi.mocked(updateTimeReport).mockResolvedValueOnce(boxReport)

		const res = await app.request('/api/box/sync', {
			method: 'POST',
			headers: {
				Authorization: 'Bearer valid-token',
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ year: 2024, month: 3 }),
		})
		expect(res.status).toBe(200)

		const [, , entries] = vi.mocked(updateTimeReport).mock.calls[0]
		// 240 + 180 = 420 minutes = 07:00
		expect(entries[0].hours).toBe('07:00')
		expect(entries[0].comment).toBe('Morning work, Afternoon work')
	})
})
