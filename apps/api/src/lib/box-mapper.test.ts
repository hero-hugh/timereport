import { describe, expect, it } from 'vitest'
import { mapTimeEntriesToBox, minutesToHHMM } from './box-mapper'

describe('minutesToHHMM', () => {
	it('converts 0 minutes to 00:00', () => {
		expect(minutesToHHMM(0)).toBe('00:00')
	})

	it('converts 480 minutes to 08:00', () => {
		expect(minutesToHHMM(480)).toBe('08:00')
	})

	it('converts 1439 minutes to 23:59', () => {
		expect(minutesToHHMM(1439)).toBe('23:59')
	})

	it('converts 90 minutes to 01:30', () => {
		expect(minutesToHHMM(90)).toBe('01:30')
	})

	it('converts 5 minutes to 00:05', () => {
		expect(minutesToHHMM(5)).toBe('00:05')
	})

	it('converts 60 minutes to 01:00', () => {
		expect(minutesToHHMM(60)).toBe('01:00')
	})
})

describe('mapTimeEntriesToBox', () => {
	it('maps a single time entry to BOX format', () => {
		const entries = [
			{
				date: new Date('2026-03-15T00:00:00.000Z'),
				minutes: 480,
				description: 'Development work',
			},
		]

		const result = mapTimeEntriesToBox(entries)

		expect(result).toEqual([
			{
				type: 'common',
				date: '2026-03-15',
				hours: '08:00',
				comment: 'Development work',
			},
		])
	})

	it('maps multiple entries', () => {
		const entries = [
			{
				date: new Date('2026-03-01T00:00:00.000Z'),
				minutes: 480,
				description: 'Day 1',
			},
			{
				date: new Date('2026-03-02T00:00:00.000Z'),
				minutes: 240,
				description: 'Day 2',
			},
		]

		const result = mapTimeEntriesToBox(entries)

		expect(result).toHaveLength(2)
		expect(result[0].date).toBe('2026-03-01')
		expect(result[0].hours).toBe('08:00')
		expect(result[1].date).toBe('2026-03-02')
		expect(result[1].hours).toBe('04:00')
	})

	it('handles null description', () => {
		const entries = [
			{
				date: new Date('2026-03-10T00:00:00.000Z'),
				minutes: 60,
				description: null,
			},
		]

		const result = mapTimeEntriesToBox(entries)

		expect(result[0].comment).toBeNull()
	})

	it('handles empty description as null', () => {
		const entries = [
			{
				date: new Date('2026-03-10T00:00:00.000Z'),
				minutes: 120,
				description: '',
			},
		]

		const result = mapTimeEntriesToBox(entries)

		expect(result[0].comment).toBe('')
	})

	it('handles 0 minutes', () => {
		const entries = [
			{
				date: new Date('2026-03-05T00:00:00.000Z'),
				minutes: 0,
				description: null,
			},
		]

		const result = mapTimeEntriesToBox(entries)

		expect(result[0].hours).toBe('00:00')
	})

	it('always sets type to common', () => {
		const entries = [
			{
				date: new Date('2026-03-01T00:00:00.000Z'),
				minutes: 480,
				description: 'Work',
			},
			{
				date: new Date('2026-03-02T00:00:00.000Z'),
				minutes: 240,
				description: null,
			},
		]

		const result = mapTimeEntriesToBox(entries)

		for (const entry of result) {
			expect(entry.type).toBe('common')
		}
	})

	it('returns empty array for empty input', () => {
		expect(mapTimeEntriesToBox([])).toEqual([])
	})
})
