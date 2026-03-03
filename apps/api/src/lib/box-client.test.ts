import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	BoxApiError,
	fetchBoxGraphQL,
	getSingleTimeReport,
	getTimeReports,
	updateTimeReport,
} from './box-client'

const fetchMock = vi.fn()

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
	vi.restoreAllMocks()
})

function mockFetchResponse(body: unknown, status = 200) {
	fetchMock.mockResolvedValueOnce({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	})
}

describe('fetchBoxGraphQL', () => {
	it('sends correct request with token and query', async () => {
		mockFetchResponse({ data: { result: 'ok' } })

		await fetchBoxGraphQL('my-token', 'query { test }', { foo: 'bar' })

		expect(fetchMock).toHaveBeenCalledWith(
			'https://api.box.developersbay.se/api/v1/graphql',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: 'Bearer my-token',
				},
				body: JSON.stringify({
					query: 'query { test }',
					variables: { foo: 'bar' },
				}),
			},
		)
	})

	it('returns data on success', async () => {
		mockFetchResponse({ data: { users: [{ id: '1' }] } })

		const result = await fetchBoxGraphQL('token', 'query { users { id } }')
		expect(result).toEqual({ users: [{ id: '1' }] })
	})

	it('throws BoxApiError on network failure', async () => {
		fetchMock.mockRejectedValueOnce(new Error('Failed to connect'))

		const error = await fetchBoxGraphQL('token', 'query { test }').catch(
			(e) => e,
		)
		expect(error).toBeInstanceOf(BoxApiError)
		expect(error.message).toContain('Network error')
	})

	it('throws BoxApiError on non-OK HTTP status', async () => {
		mockFetchResponse({}, 500)

		await expect(fetchBoxGraphQL('token', 'query { test }')).rejects.toThrow(
			'BOX API returned status 500',
		)
	})

	it('throws BoxApiError on GraphQL errors', async () => {
		mockFetchResponse({
			data: null,
			errors: [{ message: 'Invalid query' }],
		})

		await expect(fetchBoxGraphQL('token', 'query { bad }')).rejects.toThrow(
			'Invalid query',
		)
	})

	it('throws BoxApiError on empty data', async () => {
		mockFetchResponse({ data: null })

		await expect(fetchBoxGraphQL('token', 'query { test }')).rejects.toThrow(
			'BOX API returned empty response',
		)
	})
})

describe('getTimeReports', () => {
	it('returns time reports for year and month', async () => {
		const reports = [
			{
				id: 'r1',
				date: '2026-03-01',
				totalHours: '160:00',
				timeReportEntries: [
					{
						id: 'e1',
						type: 'common',
						date: '2026-03-01',
						hours: '08:00',
						comment: 'Work',
					},
				],
			},
		]
		mockFetchResponse({ data: { timeReports: reports } })

		const result = await getTimeReports('token', 2026, 3)
		expect(result).toEqual(reports)

		const body = JSON.parse(fetchMock.mock.calls[0][1].body)
		expect(body.variables).toEqual({ year: 2026, month: 3 })
	})
})

describe('getSingleTimeReport', () => {
	it('returns a single time report by id', async () => {
		const report = {
			id: 'r1',
			date: '2026-03-01',
			totalHours: '160:00',
			timeReportEntries: [
				{
					id: 'e1',
					type: 'common',
					date: '2026-03-01',
					hours: '08:00',
					comment: 'Work',
				},
			],
		}
		mockFetchResponse({ data: { timeReport: report } })

		const result = await getSingleTimeReport('token', 'r1')
		expect(result).toEqual(report)

		const body = JSON.parse(fetchMock.mock.calls[0][1].body)
		expect(body.variables).toEqual({ id: 'r1' })
	})
})

describe('updateTimeReport', () => {
	it('sends mutation with entries and returns updated report', async () => {
		const updatedReport = {
			id: 'r1',
			date: '2026-03-01',
			totalHours: '08:00',
			timeReportEntries: [
				{
					id: 'e1',
					type: 'common',
					date: '2026-03-01',
					hours: '08:00',
					comment: 'Updated',
				},
			],
		}
		mockFetchResponse({ data: { updateTimeReport: updatedReport } })

		const entries = [
			{
				id: 'e1',
				type: 'common',
				date: '2026-03-01',
				hours: '08:00',
				comment: 'Updated',
			},
		]
		const result = await updateTimeReport('token', 'r1', entries)
		expect(result).toEqual(updatedReport)

		const body = JSON.parse(fetchMock.mock.calls[0][1].body)
		expect(body.variables).toEqual({
			id: 'r1',
			input: {
				timeReportEntries: entries,
				supplierInvoiceNumber: null,
			},
		})
	})
})
