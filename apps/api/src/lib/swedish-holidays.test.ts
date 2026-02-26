import { describe, expect, it } from 'vitest'
import {
	getHolidaysInRange,
	getSwedishHolidays,
	isRedDay,
	isSwedishHoliday,
	isWeekend,
} from './swedish-holidays'

describe('swedish-holidays', () => {
	describe('getSwedishHolidays', () => {
		it('should return all public holidays for 2024', () => {
			const holidays = getSwedishHolidays(2024)

			// Should have around 17-18 holidays
			expect(holidays.length).toBeGreaterThanOrEqual(17)

			// Check fixed holidays
			const holidayDates = holidays.map((h) => h.date)
			expect(holidayDates).toContain('2024-01-01') // Nyårsdagen
			expect(holidayDates).toContain('2024-01-06') // Trettondedag jul
			expect(holidayDates).toContain('2024-05-01') // Första maj
			expect(holidayDates).toContain('2024-06-06') // Nationaldagen
			expect(holidayDates).toContain('2024-12-24') // Julafton
			expect(holidayDates).toContain('2024-12-25') // Juldagen
			expect(holidayDates).toContain('2024-12-26') // Annandag jul
			expect(holidayDates).toContain('2024-12-31') // Nyårsafton
		})

		it('should calculate Easter correctly for 2024', () => {
			const holidays = getSwedishHolidays(2024)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// Easter 2024 is March 31
			expect(holidayMap.get('Påskdagen')).toBe('2024-03-31')
			expect(holidayMap.get('Långfredagen')).toBe('2024-03-29')
			expect(holidayMap.get('Påskafton')).toBe('2024-03-30')
			expect(holidayMap.get('Annandag påsk')).toBe('2024-04-01')
		})

		it('should calculate Easter correctly for 2025', () => {
			const holidays = getSwedishHolidays(2025)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// Easter 2025 is April 20
			expect(holidayMap.get('Påskdagen')).toBe('2025-04-20')
			expect(holidayMap.get('Långfredagen')).toBe('2025-04-18')
		})

		it('should calculate Kristi himmelsfärdsdag correctly', () => {
			const holidays = getSwedishHolidays(2024)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// 39 days after Easter (March 31) = May 9
			expect(holidayMap.get('Kristi himmelsfärdsdag')).toBe('2024-05-09')
		})

		it('should calculate Pingstdagen correctly', () => {
			const holidays = getSwedishHolidays(2024)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// 49 days after Easter (March 31) = May 19
			expect(holidayMap.get('Pingstdagen')).toBe('2024-05-19')
		})

		it('should calculate Midsummer correctly for 2024', () => {
			const holidays = getSwedishHolidays(2024)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// Midsommarafton 2024 is June 21 (Friday)
			expect(holidayMap.get('Midsommarafton')).toBe('2024-06-21')
			expect(holidayMap.get('Midsommardagen')).toBe('2024-06-22')
		})

		it('should calculate Midsummer correctly for 2025', () => {
			const holidays = getSwedishHolidays(2025)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// Midsommarafton 2025 is June 20 (Friday)
			expect(holidayMap.get('Midsommarafton')).toBe('2025-06-20')
			expect(holidayMap.get('Midsommardagen')).toBe('2025-06-21')
		})

		it('should calculate All Saints Day correctly for 2024', () => {
			const holidays = getSwedishHolidays(2024)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// Alla helgons dag 2024 is November 2 (Saturday)
			expect(holidayMap.get('Alla helgons dag')).toBe('2024-11-02')
		})

		it('should calculate All Saints Day correctly for 2025', () => {
			const holidays = getSwedishHolidays(2025)
			const holidayMap = new Map(holidays.map((h) => [h.name, h.date]))

			// Alla helgons dag 2025 is November 1 (Saturday)
			expect(holidayMap.get('Alla helgons dag')).toBe('2025-11-01')
		})

		it('should return holidays sorted by date', () => {
			const holidays = getSwedishHolidays(2024)

			for (let i = 1; i < holidays.length; i++) {
				expect(holidays[i].date >= holidays[i - 1].date).toBe(true)
			}
		})
	})

	describe('isSwedishHoliday', () => {
		it('should return true for Nyårsdagen', () => {
			expect(isSwedishHoliday('2024-01-01')).toBe(true)
			expect(isSwedishHoliday(new Date('2024-01-01'))).toBe(true)
		})

		it('should return true for Easter Sunday', () => {
			expect(isSwedishHoliday('2024-03-31')).toBe(true)
		})

		it('should return false for a regular day', () => {
			expect(isSwedishHoliday('2024-03-15')).toBe(false) // A Friday in March
		})

		it('should return false for a weekend that is not a holiday', () => {
			// Just testing that isSwedishHoliday doesn't count weekends
			expect(isSwedishHoliday('2024-03-16')).toBe(false) // Saturday
		})
	})

	describe('isWeekend', () => {
		it('should return true for Saturday', () => {
			expect(isWeekend('2024-03-16')).toBe(true)
			expect(isWeekend(new Date('2024-03-16'))).toBe(true)
		})

		it('should return true for Sunday', () => {
			expect(isWeekend('2024-03-17')).toBe(true)
		})

		it('should return false for weekdays', () => {
			expect(isWeekend('2024-03-18')).toBe(false) // Monday
			expect(isWeekend('2024-03-19')).toBe(false) // Tuesday
			expect(isWeekend('2024-03-20')).toBe(false) // Wednesday
			expect(isWeekend('2024-03-21')).toBe(false) // Thursday
			expect(isWeekend('2024-03-22')).toBe(false) // Friday
		})
	})

	describe('isRedDay', () => {
		it('should return true for holidays', () => {
			expect(isRedDay('2024-01-01')).toBe(true) // Nyårsdagen
			expect(isRedDay('2024-12-25')).toBe(true) // Juldagen
		})

		it('should return true for weekends', () => {
			expect(isRedDay('2024-03-16')).toBe(true) // Saturday
			expect(isRedDay('2024-03-17')).toBe(true) // Sunday
		})

		it('should return false for regular weekdays', () => {
			expect(isRedDay('2024-03-18')).toBe(false) // Monday
			expect(isRedDay('2024-03-15')).toBe(false) // Friday
		})
	})

	describe('getHolidaysInRange', () => {
		it('should return holidays within a date range', () => {
			const holidays = getHolidaysInRange('2024-03-01', '2024-04-30')

			// Should include Easter holidays
			const names = holidays.map((h) => h.name)
			expect(names).toContain('Långfredagen')
			expect(names).toContain('Påskdagen')
			expect(names).toContain('Annandag påsk')
		})

		it('should not return holidays outside the range', () => {
			const holidays = getHolidaysInRange('2024-02-01', '2024-02-28')

			// February has no Swedish holidays
			expect(holidays.length).toBe(0)
		})

		it('should handle ranges spanning multiple years', () => {
			const holidays = getHolidaysInRange('2024-12-20', '2025-01-10')

			const names = holidays.map((h) => h.name)
			expect(names).toContain('Julafton') // 2024-12-24
			expect(names).toContain('Juldagen') // 2024-12-25
			expect(names).toContain('Nyårsdagen') // 2025-01-01
			expect(names).toContain('Trettondedag jul') // 2025-01-06
		})

		it('should return January holidays', () => {
			const holidays = getHolidaysInRange('2024-01-01', '2024-01-31')

			expect(holidays.length).toBe(2)
			expect(holidays[0].name).toBe('Nyårsdagen')
			expect(holidays[1].name).toBe('Trettondedag jul')
		})
	})

	describe('Easter calculations for various years', () => {
		// Verify against known Easter dates
		const knownEasterDates: [number, string][] = [
			[2020, '2020-04-12'],
			[2021, '2021-04-04'],
			[2022, '2022-04-17'],
			[2023, '2023-04-09'],
			[2024, '2024-03-31'],
			[2025, '2025-04-20'],
			[2026, '2026-04-05'],
			[2027, '2027-03-28'],
			[2028, '2028-04-16'],
			[2029, '2029-04-01'],
			[2030, '2030-04-21'],
		]

		it.each(knownEasterDates)(
			'should calculate Easter %i correctly as %s',
			(year, expectedDate) => {
				const holidays = getSwedishHolidays(year)
				const easter = holidays.find((h) => h.name === 'Påskdagen')
				expect(easter?.date).toBe(expectedDate)
			},
		)
	})
})
