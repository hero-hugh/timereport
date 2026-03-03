export interface LocalTimeEntry {
	date: Date
	minutes: number
	description: string | null
}

export interface BoxEntryInput {
	type: 'common'
	date: string
	hours: string
	comment: string | null
}

export function minutesToHHMM(minutes: number): string {
	const h = Math.floor(minutes / 60)
	const m = minutes % 60
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDate(date: Date): string {
	const y = date.getUTCFullYear()
	const m = String(date.getUTCMonth() + 1).padStart(2, '0')
	const d = String(date.getUTCDate()).padStart(2, '0')
	return `${y}-${m}-${d}`
}

export function mapTimeEntriesToBox(
	entries: LocalTimeEntry[],
): BoxEntryInput[] {
	return entries.map((entry) => ({
		type: 'common' as const,
		date: formatDate(entry.date),
		hours: minutesToHHMM(entry.minutes),
		comment: entry.description ?? null,
	}))
}
