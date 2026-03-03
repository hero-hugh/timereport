const BOX_API_URL = 'https://api.box.developersbay.se/api/v1/graphql'

export interface BoxTimeReportEntry {
	id: string
	type: string
	date: string
	hours: string
	comment: string | null
}

export interface BoxTimeReport {
	id: string
	date: string
	totalHours: string
	timeReportEntries: BoxTimeReportEntry[]
}

interface BoxGraphQLResponse<T> {
	data?: T
	errors?: Array<{ message: string }>
}

export class BoxApiError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'BoxApiError'
	}
}

export async function fetchBoxGraphQL<T>(
	token: string,
	query: string,
	variables?: Record<string, unknown>,
): Promise<T> {
	let response: Response
	try {
		response = await fetch(BOX_API_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ query, variables }),
		})
	} catch (error) {
		throw new BoxApiError(
			`Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
		)
	}

	if (!response.ok) {
		throw new BoxApiError(`BOX API returned status ${response.status}`)
	}

	const result = (await response.json()) as BoxGraphQLResponse<T>

	if (result.errors?.length) {
		throw new BoxApiError(result.errors[0].message)
	}

	if (!result.data) {
		throw new BoxApiError('BOX API returned empty response')
	}

	return result.data
}

const GET_TIME_REPORTS_QUERY = `
  query GetTimeReports($first: Int!, $page: Int, $orderBy: [GetTimeReportsOrderByClause], $filters: GetTimeReportFilters) {
    timeReports(first: $first, page: $page, orderBy: $orderBy, filters: $filters) {
      totalCount
      edges {
        node {
          id
          date
          usage
          totalHours
        }
      }
      pageInfo {
        currentPage
        hasPreviousPage
        hasNextPage
      }
    }
  }
`

const GET_SINGLE_TIME_REPORT_QUERY = `
  query GetTimeReport($id: ID!) {
    timeReport(id: $id) {
      id
      date
      totalHours
      timeReportEntries {
        id
        type
        date
        hours
        comment
      }
    }
  }
`

const UPDATE_TIME_REPORT_MUTATION = `
  mutation UpdateTimeReport($id: ID!, $input: UpdateTimeReportInput!) {
    updateTimeReport(id: $id, input: $input) {
      id
      date
      totalHours
      timeReportEntries {
        id
        type
        date
        hours
        comment
      }
    }
  }
`

export async function getTimeReports(
	token: string,
	year: number,
	month: number,
): Promise<BoxTimeReport[]> {
	const data = await fetchBoxGraphQL<{
		timeReports: BoxTimeReport[]
	}>(token, GET_TIME_REPORTS_QUERY, { year, month })
	return data.timeReports
}

export async function getSingleTimeReport(
	token: string,
	reportId: string,
): Promise<BoxTimeReport> {
	const data = await fetchBoxGraphQL<{
		timeReport: BoxTimeReport
	}>(token, GET_SINGLE_TIME_REPORT_QUERY, { id: reportId })
	return data.timeReport
}

export interface UpdateTimeReportEntryInput {
	id: string
	type: string
	date: string
	hours: string
	comment: string | null
}

export async function updateTimeReport(
	token: string,
	reportId: string,
	entries: UpdateTimeReportEntryInput[],
): Promise<BoxTimeReport> {
	const data = await fetchBoxGraphQL<{
		updateTimeReport: BoxTimeReport
	}>(token, UPDATE_TIME_REPORT_MUTATION, {
		id: reportId,
		input: {
			timeReportEntries: entries,
			supplierInvoiceNumber: null,
		},
	})
	return data.updateTimeReport
}
