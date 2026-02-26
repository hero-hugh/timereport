import { describe, expect, it } from 'vitest'
import {
	cn,
	formatCurrency,
	formatDate,
	formatMinutes,
	getWeekDays,
	getWeekNumber,
	getWeekStart,
	parseTimeInput,
} from './utils'

describe('cn', () => {
	it('should merge class names', () => {
		expect(cn('foo', 'bar')).toBe('foo bar')
	})

	it('should handle conditional classes', () => {
		expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
	})

	it('should merge tailwind classes correctly', () => {
		expect(cn('p-4', 'p-2')).toBe('p-2')
		expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
	})
})

describe('formatMinutes', () => {
	describe('short format', () => {
		it('should format minutes only', () => {
			expect(formatMinutes(30)).toBe('30m')
			expect(formatMinutes(45)).toBe('45m')
		})

		it('should format hours only', () => {
			expect(formatMinutes(60)).toBe('1h')
			expect(formatMinutes(120)).toBe('2h')
		})

		it('should format hours and minutes', () => {
			expect(formatMinutes(90)).toBe('1h 30m')
			expect(formatMinutes(150)).toBe('2h 30m')
		})

		it('should handle zero', () => {
			expect(formatMinutes(0)).toBe('0m')
		})
	})

	describe('time format', () => {
		it('should format as H:MM', () => {
			expect(formatMinutes(90, 'time')).toBe('1:30')
			expect(formatMinutes(60, 'time')).toBe('1:00')
			expect(formatMinutes(65, 'time')).toBe('1:05')
		})

		it('should handle zero', () => {
			expect(formatMinutes(0, 'time')).toBe('0:00')
		})
	})
})

describe('parseTimeInput', () => {
	it('should parse H:MM format', () => {
		expect(parseTimeInput('2:30')).toBe(150)
		expect(parseTimeInput('1:00')).toBe(60)
		expect(parseTimeInput('0:45')).toBe(45)
	})

	it('should parse decimal format', () => {
		expect(parseTimeInput('2.5')).toBe(150)
		expect(parseTimeInput('1.5')).toBe(90)
		expect(parseTimeInput('0.5')).toBe(30)
	})

	it('should parse decimal with comma (Swedish format)', () => {
		expect(parseTimeInput('2,5')).toBe(150)
		expect(parseTimeInput('1,5')).toBe(90)
	})

	it('should parse whole hours', () => {
		expect(parseTimeInput('2')).toBe(120)
		expect(parseTimeInput('1')).toBe(60)
		expect(parseTimeInput('8')).toBe(480)
	})

	it('should handle whitespace', () => {
		expect(parseTimeInput('  2:30  ')).toBe(150)
		expect(parseTimeInput('  2.5  ')).toBe(150)
	})

	it('should return null for empty input', () => {
		expect(parseTimeInput('')).toBeNull()
		expect(parseTimeInput('   ')).toBeNull()
		expect(parseTimeInput('-')).toBeNull()
	})

	it('should return null for invalid input', () => {
		expect(parseTimeInput('abc')).toBeNull()
		expect(parseTimeInput('a:b')).toBeNull()
	})
})

describe('formatCurrency', () => {
	it('should format ören to kronor', () => {
		// Intl.NumberFormat uses non-breaking space (\u00A0)
		expect(formatCurrency(85000)).toBe('850\u00A0kr')
		expect(formatCurrency(100000)).toBe('1\u00A0000\u00A0kr')
	})

	it('should handle zero', () => {
		expect(formatCurrency(0)).toBe('0\u00A0kr')
	})

	it('should round to whole kronor', () => {
		expect(formatCurrency(8550)).toBe('86\u00A0kr')
	})
})

describe('formatDate', () => {
	const testDate = new Date('2024-03-15T12:00:00')

	it('should format short date', () => {
		const result = formatDate(testDate, 'short')
		expect(result).toContain('15')
	})

	it('should format long date', () => {
		const result = formatDate(testDate, 'long')
		expect(result).toContain('15')
		expect(result.toLowerCase()).toContain('mars')
	})

	it('should format weekday', () => {
		const result = formatDate(testDate, 'weekday')
		expect(result).toContain('15')
	})

	it('should accept string dates', () => {
		const result = formatDate('2024-03-15', 'short')
		expect(result).toContain('15')
	})
})

describe('getWeekStart', () => {
	it('should return Monday for a given date', () => {
		// Wednesday March 20, 2024
		const wednesday = new Date('2024-03-20T12:00:00')
		const monday = getWeekStart(wednesday)
		expect(monday.getDay()).toBe(1) // Monday
		expect(monday.getDate()).toBe(18)
	})

	it('should return same day if already Monday', () => {
		// Monday March 18, 2024
		const monday = new Date('2024-03-18T12:00:00')
		const result = getWeekStart(monday)
		expect(result.getDay()).toBe(1)
		expect(result.getDate()).toBe(18)
	})

	it('should handle Sunday correctly', () => {
		// Sunday March 24, 2024
		const sunday = new Date('2024-03-24T12:00:00')
		const monday = getWeekStart(sunday)
		expect(monday.getDay()).toBe(1)
		expect(monday.getDate()).toBe(18)
	})

	it('should set time to midnight', () => {
		const date = new Date('2024-03-20T15:30:45')
		const monday = getWeekStart(date)
		expect(monday.getHours()).toBe(0)
		expect(monday.getMinutes()).toBe(0)
		expect(monday.getSeconds()).toBe(0)
	})
})

describe('getWeekDays', () => {
	it('should return 7 days starting from the given date', () => {
		const monday = new Date('2024-03-18T00:00:00')
		const days = getWeekDays(monday)

		expect(days).toHaveLength(7)
		expect(days[0].getDate()).toBe(18) // Monday
		expect(days[6].getDate()).toBe(24) // Sunday
	})

	it('should handle month boundaries', () => {
		// Monday March 25, week extends into April
		const monday = new Date('2024-03-25T00:00:00')
		const days = getWeekDays(monday)

		expect(days[0].getDate()).toBe(25) // March 25
		expect(days[6].getMonth()).toBe(2) // March 31 (Sunday)
	})
})

describe('getWeekNumber', () => {
	it('should return correct week number', () => {
		// Week 12 of 2024
		const date = new Date('2024-03-20T12:00:00')
		expect(getWeekNumber(date)).toBe(12)
	})

	it('should handle first week of year', () => {
		const date = new Date('2024-01-04T12:00:00')
		expect(getWeekNumber(date)).toBe(1)
	})

	it('should handle last week of year', () => {
		const date = new Date('2024-12-30T12:00:00')
		expect(getWeekNumber(date)).toBe(1) // Week 1 of next year
	})
})
