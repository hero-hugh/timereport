import { z } from 'zod'

// Auth schemas
export const requestOtpSchema = z.object({
	email: z.string().email('Ogiltig e-postadress'),
})

export const verifyOtpSchema = z.object({
	email: z.string().email('Ogiltig e-postadress'),
	code: z
		.string()
		.length(6, 'Koden måste vara 6 siffror')
		.regex(/^\d+$/, 'Koden får bara innehålla siffror'),
})

// Project schemas
export const createProjectSchema = z.object({
	name: z.string().min(1, 'Namn krävs').max(100, 'Max 100 tecken'),
	description: z.string().max(500, 'Max 500 tecken').optional(),
	hourlyRate: z
		.number()
		.int()
		.min(0, 'Timpris kan inte vara negativt')
		.optional(), // I ören
	startDate: z.string().datetime().or(z.string().date()),
	endDate: z.string().datetime().or(z.string().date()).optional().nullable(),
})

export const updateProjectSchema = createProjectSchema.partial().extend({
	isActive: z.boolean().optional(),
})

// Time entry schemas
export const createTimeEntrySchema = z.object({
	projectId: z.string().uuid('Ogiltigt projekt-ID'),
	date: z.string().date('Ogiltigt datumformat (YYYY-MM-DD)'),
	minutes: z
		.number()
		.int()
		.min(1, 'Minst 1 minut')
		.max(1440, 'Max 24 timmar per dag'),
	description: z.string().max(500, 'Max 500 tecken').optional(),
})

export const updateTimeEntrySchema = createTimeEntrySchema
	.omit({ projectId: true })
	.partial()

// Query schemas
export const timeEntriesQuerySchema = z.object({
	projectId: z.string().uuid().optional(),
	from: z.string().date().optional(),
	to: z.string().date().optional(),
})

export const reportQuerySchema = z.object({
	projectId: z.string().uuid().optional(),
	from: z.string().date(),
	to: z.string().date(),
})

// User schemas
export const updateUserSchema = z.object({
	name: z.string().min(1).max(100).optional(),
})
