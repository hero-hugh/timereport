import type { z } from 'zod'
import type {
	createProjectSchema,
	createTimeEntrySchema,
	reportQuerySchema,
	requestOtpSchema,
	timeEntriesQuerySchema,
	updateProjectSchema,
	updateTimeEntrySchema,
	updateUserSchema,
	verifyOtpSchema,
} from './validation'

// Auth types
export type RequestOtpInput = z.infer<typeof requestOtpSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>

// User types
export type UpdateUserInput = z.infer<typeof updateUserSchema>

export interface User {
	id: string
	email: string
	name: string | null
	createdAt: Date
	updatedAt: Date
}

// Project types
export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export interface Project {
	id: string
	userId: string
	name: string
	description: string | null
	hourlyRate: number | null
	startDate: Date
	endDate: Date | null
	isActive: boolean
	createdAt: Date
	updatedAt: Date
}

export interface ProjectWithStats extends Project {
	totalMinutes: number
	totalAmount: number | null // null om inget hourlyRate
}

// Time entry types
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>
export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>
export type TimeEntriesQuery = z.infer<typeof timeEntriesQuerySchema>

export interface TimeEntry {
	id: string
	projectId: string
	userId: string
	date: Date
	minutes: number
	description: string | null
	createdAt: Date
	updatedAt: Date
}

export interface TimeEntryWithProject extends TimeEntry {
	project: Pick<Project, 'id' | 'name' | 'hourlyRate'>
}

// Report types
export type ReportQuery = z.infer<typeof reportQuerySchema>

export interface ReportSummary {
	totalMinutes: number
	totalAmount: number
	projects: ProjectReportItem[]
}

export interface ProjectReportItem {
	projectId: string
	projectName: string
	hourlyRate: number | null
	totalMinutes: number
	totalAmount: number | null
}

// API Response types
export interface ApiResponse<T> {
	success: boolean
	data?: T
	error?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
	pagination: {
		page: number
		limit: number
		total: number
		totalPages: number
	}
}
