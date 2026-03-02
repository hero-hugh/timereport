const BOX_API_ENDPOINT = 'https://api.box.developersbay.se/api/v1/graphql'

// --- TypeScript interfaces for BOX API responses ---

export interface BoxUser {
	id: string
	type: string
	firstName: string
	lastName: string
}

export interface BoxTimeReportEntry {
	id: string
	timeReportId: string
	usageFee: number | null
	type: string
	date: string
	hours: string
	comment: string | null
}

export interface BoxTimeReport {
	id: string
	date: string
	usage: BoxUser
	totalHours: number
}

export interface BoxTimeReportWithEntries extends BoxTimeReport {
	timeReportEntries: BoxTimeReportEntry[]
}

interface BoxPageInfo {
	currentPage: number
	hasPreviousPage: boolean
	hasNextPage: boolean
}

interface BoxTimeReportsResponse {
	data: {
		timeReports: {
			totalCount: number
			edges: { node: BoxTimeReport }[]
			pageInfo: BoxPageInfo
		}
	}
}

interface BoxSingleTimeReportResponse {
	data: {
		timeReport: BoxTimeReportWithEntries
	}
}

interface BoxUpdateTimeReportResponse {
	data: {
		updateTimeReport: BoxTimeReportWithEntries
	}
}

interface GraphQLErrorResponse {
	errors?: { message: string }[]
}

// --- GraphQL queries ---

const GET_TIME_REPORTS_QUERY = `
query GetTimeReports($first: Int!, $page: Int, $orderBy: [GetTimeReportsOrderByClause], $filters: GetTimeReportFilters) {
  timeReports(first: $first, page: $page, orderBy: $orderBy, filters: $filters) {
    totalCount
    edges { node { id, date, usage { ... on User { id, type, firstName, lastName } }, totalHours } }
    pageInfo { currentPage, hasPreviousPage, hasNextPage }
  }
}
`

const GET_SINGLE_TIME_REPORT_QUERY = `
query GetTimeReport($id: ID) {
  timeReport(id: $id) {
    id, date, usage { ... on User { id, firstName, lastName } }, totalHours,
    timeReportEntries { id, timeReportId, usageFee, type, date, hours, comment }
  }
}
`

const UPDATE_TIME_REPORT_MUTATION = `
mutation UpdateTimeReport($id: ID!, $input: UpdateTimeReportInput!) {
  updateTimeReport(id: $id, input: $input) {
    id, date, usageFee, usage { ... on User { id, firstName, lastName } }, totalHours,
    timeReportEntries { id, timeReportId, usageFee, type, date, hours, comment }
  }
}
`

// Month names for the BOX API filter
const MONTH_NAMES = [
	'Januari',
	'Februari',
	'Mars',
	'April',
	'Maj',
	'Juni',
	'Juli',
	'Augusti',
	'September',
	'Oktober',
	'November',
	'December',
]

export class BoxService {
	private async fetchGraphQL<T>(
		query: string,
		variables: Record<string, unknown>,
		token: string,
	): Promise<T> {
		let response: Response
		try {
			response = await fetch(BOX_API_ENDPOINT, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ query, variables }),
			})
		} catch (error) {
			throw new Error(
				`Nätverksfel vid anslutning till BOX API: ${error instanceof Error ? error.message : 'Okänt fel'}`,
			)
		}

		if (!response.ok) {
			throw new Error(
				`BOX API returnerade HTTP ${response.status}: ${response.statusText}`,
			)
		}

		const json = (await response.json()) as T & GraphQLErrorResponse
		if (json.errors?.length) {
			throw new Error(`BOX GraphQL-fel: ${json.errors[0].message}`)
		}

		return json
	}

	async getTimeReports(
		token: string,
		year: number,
		month: number,
	): Promise<BoxTimeReport[]> {
		const monthName = MONTH_NAMES[month - 1]
		const variables = {
			first: 20,
			filters: {
				year: { value: year, label: String(year) },
				month: { value: month, label: monthName },
				statuses: null,
			},
			orderBy: [{ column: 'DATE', order: 'DESC' }],
		}

		const result = await this.fetchGraphQL<BoxTimeReportsResponse>(
			GET_TIME_REPORTS_QUERY,
			variables,
			token,
		)

		return result.data.timeReports.edges.map((edge) => edge.node)
	}

	async getSingleTimeReport(
		token: string,
		reportId: string,
	): Promise<BoxTimeReportWithEntries> {
		const result = await this.fetchGraphQL<BoxSingleTimeReportResponse>(
			GET_SINGLE_TIME_REPORT_QUERY,
			{ id: reportId },
			token,
		)

		return result.data.timeReport
	}

	async updateTimeReport(
		token: string,
		reportId: string,
		entries: BoxTimeReportEntry[],
	): Promise<BoxTimeReportWithEntries> {
		const result = await this.fetchGraphQL<BoxUpdateTimeReportResponse>(
			UPDATE_TIME_REPORT_MUTATION,
			{
				id: reportId,
				input: {
					timeReportEntries: entries,
					supplierInvoiceNumber: null,
				},
			},
			token,
		)

		return result.data.updateTimeReport
	}
}

export const boxService = new BoxService()
