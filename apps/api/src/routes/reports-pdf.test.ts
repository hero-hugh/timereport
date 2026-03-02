import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pdfService } from '../services/pdf.service'
import { testUserDb } from '../test/test-user-db'

vi.mock('../lib/jwt', () => ({
	verifyAccessToken: vi.fn(),
}))

vi.mock('../lib/user-db', () => ({
	getUserDb: vi.fn(),
	UserPrismaClient: {},
}))

// Import after mocks are in place (vi.mock hoists automatically)
const { default: reports } = await import('./reports')

function createApp() {
	const app = new Hono()
	app.route('/api/reports', reports)
	return app
}

async function authenticateRequest() {
	const { verifyAccessToken } = await import('../lib/jwt')
	const { getUserDb } = await import('../lib/user-db')

	vi.mocked(verifyAccessToken).mockResolvedValueOnce({
		userId: 'test-user-id',
		email: 'test@example.com',
	})
	vi.mocked(getUserDb).mockReturnValueOnce(testUserDb as never)
}

describe('GET /api/reports/pdf', () => {
	let app: ReturnType<typeof createApp>

	beforeEach(() => {
		app = createApp()
		vi.restoreAllMocks()
	})

	describe('authentication', () => {
		it('returns 401 when no auth token is provided', async () => {
			const res = await app.request('/api/reports/pdf?year=2024&month=1')
			expect(res.status).toBe(401)

			const body = (await res.json()) as { success: boolean }
			expect(body.success).toBe(false)
		})

		it('returns 401 for invalid token', async () => {
			const { verifyAccessToken } = await import('../lib/jwt')
			vi.mocked(verifyAccessToken).mockResolvedValueOnce(null)

			const res = await app.request('/api/reports/pdf?year=2024&month=1', {
				headers: { Authorization: 'Bearer invalid-token' },
			})
			expect(res.status).toBe(401)
		})
	})

	describe('validation', () => {
		it('returns 400 when year and month are missing', async () => {
			await authenticateRequest()

			const res = await app.request('/api/reports/pdf', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			expect(res.status).toBe(400)

			const body = (await res.json()) as { success: boolean; error: string }
			expect(body.success).toBe(false)
		})

		it('returns 400 for invalid month value', async () => {
			await authenticateRequest()

			const res = await app.request('/api/reports/pdf?year=2024&month=13', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			expect(res.status).toBe(400)
		})
	})

	describe('successful PDF generation', () => {
		it('returns a valid PDF with correct headers', async () => {
			await authenticateRequest()

			const res = await app.request('/api/reports/pdf?year=2024&month=1', {
				headers: { Authorization: 'Bearer valid-token' },
			})

			expect(res.status).toBe(200)
			expect(res.headers.get('content-type')).toBe('application/pdf')
			expect(res.headers.get('content-disposition')).toContain(
				'tidrapport-2024-01.pdf',
			)

			const buffer = Buffer.from(await res.arrayBuffer())
			expect(buffer.toString('latin1', 0, 5)).toBe('%PDF-')
		})

		it('passes all required data fields to PDF generation', async () => {
			// Create test project and time entries
			const project = await testUserDb.project.create({
				data: {
					name: 'Alfa Projektet',
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

			const spy = vi.spyOn(pdfService, 'generateMonthlyReport')
			await authenticateRequest()

			const res = await app.request('/api/reports/pdf?year=2024&month=3', {
				headers: { Authorization: 'Bearer valid-token' },
			})
			expect(res.status).toBe(200)

			// Verify the PDF service received all required fields
			expect(spy).toHaveBeenCalledOnce()
			const reportData = spy.mock.calls[0][0]

			// Required: user email
			expect(reportData.email).toBe('test@example.com')
			// Required: year and month
			expect(reportData.year).toBe(2024)
			expect(reportData.month).toBe(3)
			// Required: date of report generation
			expect(reportData.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
			// Required: reported hours per day
			expect(reportData.dailyHours).toHaveLength(2)
			expect(reportData.dailyHours).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						date: '2024-03-11',
						minutes: 480,
						projects: ['Alfa Projektet'],
					}),
					expect.objectContaining({
						date: '2024-03-12',
						minutes: 240,
						projects: ['Alfa Projektet'],
					}),
				]),
			)
			// Required: total reported hours
			expect(reportData.totalMinutes).toBe(720)
		})
	})

	describe('empty month handling', () => {
		it('returns a valid PDF for a month with no time entries', async () => {
			const spy = vi.spyOn(pdfService, 'generateMonthlyReport')
			await authenticateRequest()

			const res = await app.request('/api/reports/pdf?year=2024&month=6', {
				headers: { Authorization: 'Bearer valid-token' },
			})

			expect(res.status).toBe(200)
			expect(res.headers.get('content-type')).toBe('application/pdf')

			const buffer = Buffer.from(await res.arrayBuffer())
			expect(buffer.toString('latin1', 0, 5)).toBe('%PDF-')

			// Verify empty data is passed correctly
			expect(spy).toHaveBeenCalledOnce()
			const reportData = spy.mock.calls[0][0]
			expect(reportData.dailyHours).toHaveLength(0)
			expect(reportData.totalMinutes).toBe(0)
		})
	})
})
