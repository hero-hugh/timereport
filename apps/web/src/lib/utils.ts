import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

/**
 * Formatera minuter till "Xh Ym" eller "X:YY"
 */
export function formatMinutes(
	minutes: number,
	format: 'short' | 'time' = 'short',
): string {
	const hours = Math.floor(minutes / 60)
	const mins = minutes % 60

	if (format === 'time') {
		return `${hours}:${mins.toString().padStart(2, '0')}`
	}

	if (hours === 0) {
		return `${mins}m`
	}
	if (mins === 0) {
		return `${hours}h`
	}
	return `${hours}h ${mins}m`
}

/**
 * Parsa tid-input (t.ex. "2:30", "2.5", "2") till minuter
 */
export function parseTimeInput(input: string): number | null {
	const trimmed = input.trim()
	if (!trimmed || trimmed === '-') return null

	// Format: "H:MM"
	if (trimmed.includes(':')) {
		const [hours, mins] = trimmed.split(':').map(Number)
		if (Number.isNaN(hours) || Number.isNaN(mins)) return null
		return hours * 60 + mins
	}

	// Format: "H.M" (t.ex. 2.5 = 2h 30m)
	if (trimmed.includes('.') || trimmed.includes(',')) {
		const num = Number.parseFloat(trimmed.replace(',', '.'))
		if (Number.isNaN(num)) return null
		return Math.round(num * 60)
	}

	// Format: "H" (bara timmar)
	const num = Number.parseInt(trimmed, 10)
	if (Number.isNaN(num)) return null
	return num * 60
}

/**
 * Formatera belopp i ören till kronor
 */
export function formatCurrency(amountInOre: number): string {
	const kronor = amountInOre / 100
	return new Intl.NumberFormat('sv-SE', {
		style: 'currency',
		currency: 'SEK',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(kronor)
}

/**
 * Formatera datum till svensk standard
 */
export function formatDate(
	date: Date | string,
	format: 'short' | 'long' | 'weekday' = 'short',
): string {
	const d = typeof date === 'string' ? new Date(date) : date

	if (format === 'weekday') {
		return d.toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric' })
	}

	if (format === 'long') {
		return d.toLocaleDateString('sv-SE', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
		})
	}

	return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

/**
 * Hämta veckans start (måndag)
 */
export function getWeekStart(date: Date = new Date()): Date {
	const d = new Date(date)
	const day = d.getDay()
	const diff = d.getDate() - day + (day === 0 ? -6 : 1)
	d.setDate(diff)
	d.setHours(0, 0, 0, 0)
	return d
}

/**
 * Hämta alla dagar i en vecka
 */
export function getWeekDays(weekStart: Date): Date[] {
	const days: Date[] = []
	for (let i = 0; i < 7; i++) {
		const day = new Date(weekStart)
		day.setDate(weekStart.getDate() + i)
		days.push(day)
	}
	return days
}

/**
 * Formatera datum som YYYY-MM-DD (lokal tid, utan tidszonsproblem)
 */
export function toDateString(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

/**
 * Formatera veckonummer
 */
export function getWeekNumber(date: Date): number {
	const d = new Date(
		Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
	)
	const dayNum = d.getUTCDay() || 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum)
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
