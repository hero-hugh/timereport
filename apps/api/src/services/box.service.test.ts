import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	BoxService,
	type BoxTimeReportEntry,
	type BoxTimeReportWithEntries,
} from './box.service'

const mockToken = 'test-box-api-token'

function createMockResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 200 ? 'OK' : 'Error',
		json: () => Promise.resolve(body),
	} as Response
}

describe('BoxService', () => {
	let service: BoxService
	let fetchSpy: ReturnType<typeof vi.fn>

	beforeEach(() => {
		service = new BoxService()
		fetchSpy = vi.fn()
		vi.stubGlobal('fetch', fetchSpy)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe('getTimeReports', () => {
		it('should send correct GraphQL query and variables', async () => {
			const mockData = {
				data: {
					timeReports: {
						totalCount: 1,
						edges: [
							{
								node: {
									id: 'report-1',
									date: '2024-01-01',
									usage: {
										id: 'user-1',
										type: 'User',
										firstName: 'Test',
										lastName: 'User',
									},
									totalHours: 160,
								},
							},
						],
						pageInfo: {
							currentPage: 1,
							hasPreviousPage: false,
							hasNextPage: false,
						},
					},
				},
			}
			fetchSpy.mockResolvedValueOnce(createMockResponse(mockData))

			await service.getTimeReports(mockToken, 2024, 1)

			expect(fetchSpy).toHaveBeenCalledOnce()
			const [url, options] = fetchSpy.mock.calls[0]
			expect(url).toBe('https://api.box.developersbay.se/api/v1/graphql')
			expect(options.method).toBe('POST')
			expect(options.headers['Content-Type']).toBe('application/json')
			expect(options.headers.Authorization).toBe(`Bearer ${mockToken}`)

			const body = JSON.parse(options.body)
			expect(body.variables.first).toBe(20)
			expect(body.variables.filters.year).toEqual({
				value: 2024,
				label: '2024',
			})
			expect(body.variables.filters.month).toEqual({
				value: 1,
				label: 'Januari',
			})
			expect(body.variables.orderBy).toEqual([
				{ column: 'DATE', order: 'DESC' },
			])
		})

		it('should return time reports from edges', async () => {
			const mockData = {
				data: {
					timeReports: {
						totalCount: 2,
						edges: [
							{
								node: {
									id: 'report-1',
									date: '2024-01-01',
									usage: {
										id: 'user-1',
										type: 'User',
										firstName: 'Test',
										lastName: 'User',
									},
									totalHours: 160,
								},
							},
							{
								node: {
									id: 'report-2',
									date: '2024-02-01',
									usage: {
										id: 'user-1',
										type: 'User',
										firstName: 'Test',
										lastName: 'User',
									},
									totalHours: 140,
								},
							},
						],
						pageInfo: {
							currentPage: 1,
							hasPreviousPage: false,
							hasNextPage: false,
						},
					},
				},
			}
			fetchSpy.mockResolvedValueOnce(createMockResponse(mockData))

			const reports = await service.getTimeReports(mockToken, 2024, 1)

			expect(reports).toHaveLength(2)
			expect(reports[0].id).toBe('report-1')
			expect(reports[1].id).toBe('report-2')
		})

		it('should use correct month name for different months', async () => {
			const emptyResponse = {
				data: {
					timeReports: {
						totalCount: 0,
						edges: [],
						pageInfo: {
							currentPage: 1,
							hasPreviousPage: false,
							hasNextPage: false,
						},
					},
				},
			}
			fetchSpy.mockResolvedValueOnce(createMockResponse(emptyResponse))

			await service.getTimeReports(mockToken, 2024, 6)

			const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
			expect(body.variables.filters.month.label).toBe('Juni')
		})
	})

	describe('getSingleTimeReport', () => {
		it('should fetch a single report by ID', async () => {
			const mockReport: BoxTimeReportWithEntries = {
				id: 'report-1',
				date: '2024-01-01',
				usage: {
					id: 'user-1',
					type: 'User',
					firstName: 'Test',
					lastName: 'User',
				},
				totalHours: 160,
				timeReportEntries: [
					{
						id: 'entry-1',
						timeReportId: 'report-1',
						usageFee: null,
						type: 'common',
						date: '2024-01-02',
						hours: '08:00',
						comment: null,
					},
				],
			}
			fetchSpy.mockResolvedValueOnce(
				createMockResponse({ data: { timeReport: mockReport } }),
			)

			const result = await service.getSingleTimeReport(mockToken, 'report-1')

			expect(result.id).toBe('report-1')
			expect(result.timeReportEntries).toHaveLength(1)
			expect(result.timeReportEntries[0].type).toBe('common')
			expect(result.timeReportEntries[0].hours).toBe('08:00')

			const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
			expect(body.variables.id).toBe('report-1')
		})
	})

	describe('updateTimeReport', () => {
		it('should send correct mutation with entries', async () => {
			const entries: BoxTimeReportEntry[] = [
				{
					id: 'entry-1',
					timeReportId: 'report-1',
					usageFee: null,
					type: 'common',
					date: '2024-01-02',
					hours: '08:00',
					comment: null,
				},
			]

			const mockResponse: BoxTimeReportWithEntries = {
				id: 'report-1',
				date: '2024-01-01',
				usage: {
					id: 'user-1',
					type: 'User',
					firstName: 'Test',
					lastName: 'User',
				},
				totalHours: 8,
				timeReportEntries: entries,
			}
			fetchSpy.mockResolvedValueOnce(
				createMockResponse({
					data: { updateTimeReport: mockResponse },
				}),
			)

			const result = await service.updateTimeReport(
				mockToken,
				'report-1',
				entries,
			)

			expect(result.id).toBe('report-1')
			expect(result.timeReportEntries).toEqual(entries)

			const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
			expect(body.variables.id).toBe('report-1')
			expect(body.variables.input.timeReportEntries).toEqual(entries)
			expect(body.variables.input.supplierInvoiceNumber).toBeNull()
		})
	})

	describe('error handling', () => {
		it('should throw on network failure', async () => {
			fetchSpy.mockRejectedValueOnce(new Error('Connection refused'))

			await expect(service.getTimeReports(mockToken, 2024, 1)).rejects.toThrow(
				'Nätverksfel vid anslutning till BOX API: Connection refused',
			)
		})

		it('should throw on non-OK HTTP status', async () => {
			fetchSpy.mockResolvedValueOnce(createMockResponse({}, 401))

			await expect(service.getTimeReports(mockToken, 2024, 1)).rejects.toThrow(
				'BOX API returnerade HTTP 401',
			)
		})

		it('should throw on GraphQL errors', async () => {
			const errorResponse = {
				errors: [{ message: 'Unauthorized access' }],
			}
			fetchSpy.mockResolvedValueOnce(createMockResponse(errorResponse))

			await expect(service.getTimeReports(mockToken, 2024, 1)).rejects.toThrow(
				'BOX GraphQL-fel: Unauthorized access',
			)
		})

		it('should throw descriptive error for non-Error network failures', async () => {
			fetchSpy.mockRejectedValueOnce('string error')

			await expect(service.getTimeReports(mockToken, 2024, 1)).rejects.toThrow(
				'Nätverksfel vid anslutning till BOX API: Okänt fel',
			)
		})
	})
})
