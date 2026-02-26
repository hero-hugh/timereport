/**
 * Swedish holidays calculator
 * Calculates all Swedish public holidays (röda dagar) for a given year
 */

export interface Holiday {
	date: string // YYYY-MM-DD
	name: string
	type: 'public' | 'flag' // public = röd dag, flag = flaggdag
}

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 */
function getEasterSunday(year: number): Date {
	const a = year % 19
	const b = Math.floor(year / 100)
	const c = year % 100
	const d = Math.floor(b / 4)
	const e = b % 4
	const f = Math.floor((b + 8) / 25)
	const g = Math.floor((b - f + 1) / 3)
	const h = (19 * a + b - d - g + 15) % 30
	const i = Math.floor(c / 4)
	const k = c % 4
	const l = (32 + 2 * e + 2 * i - h - k) % 7
	const m = Math.floor((a + 11 * h + 22 * l) / 451)
	const month = Math.floor((h + l - 7 * m + 114) / 31)
	const day = ((h + l - 7 * m + 114) % 31) + 1

	return new Date(year, month - 1, day)
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
	const result = new Date(date)
	result.setDate(result.getDate() + days)
	return result
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

/**
 * Get Midsummer Eve (Friday between June 19-25)
 */
function getMidsummerEve(year: number): Date {
	// Find the Friday between June 19 and June 25
	for (let day = 19; day <= 25; day++) {
		const date = new Date(year, 5, day) // June is month 5
		if (date.getDay() === 5) {
			// Friday
			return date
		}
	}
	throw new Error('Could not find Midsummer Eve')
}

/**
 * Get All Saints' Day (Saturday between Oct 31 and Nov 6)
 */
function getAllSaintsDay(year: number): Date {
	// Find the Saturday between October 31 and November 6
	for (let day = 31; day <= 37; day++) {
		// 37 = Nov 6 when counting from Oct 1
		const date = new Date(year, 9, day) // October is month 9
		if (date.getDay() === 6) {
			// Saturday
			return date
		}
	}
	throw new Error('Could not find All Saints Day')
}

/**
 * Get all Swedish public holidays for a given year
 */
export function getSwedishHolidays(year: number): Holiday[] {
	const holidays: Holiday[] = []

	// Fixed holidays
	holidays.push({ date: `${year}-01-01`, name: 'Nyårsdagen', type: 'public' })
	holidays.push({
		date: `${year}-01-06`,
		name: 'Trettondedag jul',
		type: 'public',
	})
	holidays.push({
		date: `${year}-05-01`,
		name: 'Första maj',
		type: 'public',
	})
	holidays.push({
		date: `${year}-06-06`,
		name: 'Sveriges nationaldag',
		type: 'public',
	})
	holidays.push({ date: `${year}-12-24`, name: 'Julafton', type: 'public' })
	holidays.push({ date: `${year}-12-25`, name: 'Juldagen', type: 'public' })
	holidays.push({
		date: `${year}-12-26`,
		name: 'Annandag jul',
		type: 'public',
	})
	holidays.push({ date: `${year}-12-31`, name: 'Nyårsafton', type: 'public' })

	// Easter-based holidays
	const easter = getEasterSunday(year)

	holidays.push({
		date: formatDate(addDays(easter, -2)),
		name: 'Långfredagen',
		type: 'public',
	})
	holidays.push({
		date: formatDate(addDays(easter, -1)),
		name: 'Påskafton',
		type: 'public',
	})
	holidays.push({
		date: formatDate(easter),
		name: 'Påskdagen',
		type: 'public',
	})
	holidays.push({
		date: formatDate(addDays(easter, 1)),
		name: 'Annandag påsk',
		type: 'public',
	})
	holidays.push({
		date: formatDate(addDays(easter, 39)),
		name: 'Kristi himmelsfärdsdag',
		type: 'public',
	})
	holidays.push({
		date: formatDate(addDays(easter, 49)),
		name: 'Pingstdagen',
		type: 'public',
	})

	// Midsummer
	const midsummerEve = getMidsummerEve(year)
	holidays.push({
		date: formatDate(midsummerEve),
		name: 'Midsommarafton',
		type: 'public',
	})
	holidays.push({
		date: formatDate(addDays(midsummerEve, 1)),
		name: 'Midsommardagen',
		type: 'public',
	})

	// All Saints' Day
	const allSaints = getAllSaintsDay(year)
	holidays.push({
		date: formatDate(allSaints),
		name: 'Alla helgons dag',
		type: 'public',
	})

	// Sort by date
	holidays.sort((a, b) => a.date.localeCompare(b.date))

	return holidays
}

/**
 * Check if a date is a Swedish public holiday
 */
export function isSwedishHoliday(date: Date | string): boolean {
	const d = typeof date === 'string' ? new Date(date) : date
	const year = d.getFullYear()
	const dateStr = formatDate(d)

	const holidays = getSwedishHolidays(year)
	return holidays.some((h) => h.date === dateStr)
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date | string): boolean {
	const d = typeof date === 'string' ? new Date(date) : date
	const day = d.getDay()
	return day === 0 || day === 6
}

/**
 * Check if a date is a "red day" (weekend or public holiday)
 */
export function isRedDay(date: Date | string): boolean {
	return isWeekend(date) || isSwedishHoliday(date)
}

/**
 * Get holidays for a date range
 */
export function getHolidaysInRange(
	startDate: string,
	endDate: string,
): Holiday[] {
	const start = new Date(startDate)
	const end = new Date(endDate)

	const startYear = start.getFullYear()
	const endYear = end.getFullYear()

	const allHolidays: Holiday[] = []

	for (let year = startYear; year <= endYear; year++) {
		allHolidays.push(...getSwedishHolidays(year))
	}

	return allHolidays.filter((h) => h.date >= startDate && h.date <= endDate)
}
