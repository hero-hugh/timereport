import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { api } from '../lib/api'
import {
	formatDate,
	formatMinutes,
	getWeekDays,
	getWeekNumber,
	getWeekStart,
	parseTimeInput,
	toDateString,
} from '../lib/utils'
import { cn } from '../lib/utils'

interface Project {
	id: string
	name: string
	hourlyRate: number | null
	isActive: boolean
}

interface WeekData {
	[projectId: string]: {
		[date: string]: { minutes: number; id?: string }
	}
}

interface Holiday {
	date: string
	name: string
	type: 'public' | 'flag'
}

export function TimePage() {
	const [weekStart, setWeekStart] = useState(() => getWeekStart())
	const [projects, setProjects] = useState<Project[]>([])
	const [weekData, setWeekData] = useState<WeekData>({})
	const [holidays, setHolidays] = useState<Holiday[]>([])
	const [selectedProjectId, setSelectedProjectId] = useState<string>('')
	const [isLoading, setIsLoading] = useState(true)
	const [isSaving, setIsSaving] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)

	const weekDays = getWeekDays(weekStart)
	const weekNumber = getWeekNumber(weekStart)

	const loadData = useCallback(async () => {
		setIsLoading(true)

		try {
			const weekEnd = new Date(weekStart)
			weekEnd.setDate(weekEnd.getDate() + 6)

			const [projectsRes, entriesRes, holidaysRes] = await Promise.all([
				api.getProjects(),
				api.getWeekEntries(toDateString(weekStart)),
				api.getHolidays({
					from: toDateString(weekStart),
					to: toDateString(weekEnd),
				}),
			])

			if (projectsRes.success && projectsRes.data) {
				setProjects(projectsRes.data.filter((p) => p.isActive))
				if (!selectedProjectId && projectsRes.data.length > 0) {
					setSelectedProjectId(projectsRes.data[0].id)
				}
			}

			if (entriesRes.success && entriesRes.data) {
				// Bygg weekData från entries
				const data: WeekData = {}
				for (const entry of entriesRes.data.data) {
					if (!data[entry.projectId]) {
						data[entry.projectId] = {}
					}
					const dateKey = entry.date.split('T')[0]
					data[entry.projectId][dateKey] = {
						minutes: entry.minutes,
						id: entry.id,
					}
				}
				setWeekData(data)
			}

			if (holidaysRes.success && holidaysRes.data) {
				setHolidays(holidaysRes.data.holidays)
			}

			setHasChanges(false)
		} catch (error) {
			console.error('Failed to load data:', error)
		} finally {
			setIsLoading(false)
		}
	}, [weekStart, selectedProjectId])

	useEffect(() => {
		loadData()
	}, [loadData])

	const handlePrevWeek = () => {
		const newStart = new Date(weekStart)
		newStart.setDate(newStart.getDate() - 7)
		setWeekStart(newStart)
	}

	const handleNextWeek = () => {
		const newStart = new Date(weekStart)
		newStart.setDate(newStart.getDate() + 7)
		setWeekStart(newStart)
	}

	const handleToday = () => {
		setWeekStart(getWeekStart(new Date()))
	}

	// Check if we're on the current week
	const isCurrentWeek = () => {
		const today = getWeekStart(new Date())
		return weekStart.getTime() === today.getTime()
	}

	const handleTimeChange = (projectId: string, date: string, value: string) => {
		const minutes = parseTimeInput(value)

		setWeekData((prev) => {
			const newData = { ...prev }
			if (!newData[projectId]) {
				newData[projectId] = {}
			}
			newData[projectId] = {
				...newData[projectId],
				[date]: {
					...newData[projectId][date],
					minutes: minutes ?? 0,
				},
			}
			return newData
		})
		setHasChanges(true)
	}

	const handleSave = async () => {
		setIsSaving(true)

		try {
			// Spara alla ändringar
			const savePromises: Promise<unknown>[] = []

			for (const projectId of Object.keys(weekData)) {
				for (const date of Object.keys(weekData[projectId])) {
					const entry = weekData[projectId][date]
					if (entry.minutes > 0) {
						savePromises.push(
							api.createOrUpdateTimeEntry({
								projectId,
								date,
								minutes: entry.minutes,
							}),
						)
					} else if (entry.id) {
						savePromises.push(api.deleteTimeEntry(entry.id))
					}
				}
			}

			await Promise.all(savePromises)
			await loadData()
		} catch (error) {
			console.error('Failed to save:', error)
		} finally {
			setIsSaving(false)
		}
	}

	const getProjectTotal = (projectId: string): number => {
		if (!weekData[projectId]) return 0
		return Object.values(weekData[projectId]).reduce(
			(sum, entry) => sum + (entry.minutes || 0),
			0,
		)
	}

	const getDayTotal = (date: string): number => {
		let total = 0
		for (const projectId of Object.keys(weekData)) {
			total += weekData[projectId][date]?.minutes || 0
		}
		return total
	}

	const getWeekTotal = (): number => {
		let total = 0
		for (const projectId of Object.keys(weekData)) {
			total += getProjectTotal(projectId)
		}
		return total
	}

	const selectedProject = projects.find((p) => p.id === selectedProjectId)

	// Check if a date is a "red day" (weekend or holiday)
	const isRedDay = (date: Date): boolean => {
		const dayOfWeek = date.getDay()
		if (dayOfWeek === 0 || dayOfWeek === 6) return true // Weekend

		const dateStr = toDateString(date)
		return holidays.some((h) => h.date === dateStr)
	}

	// Get holiday name for a date (if any)
	const getHolidayName = (date: Date): string | undefined => {
		const dateStr = toDateString(date)
		return holidays.find((h) => h.date === dateStr)?.name
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<p className="text-muted-foreground">Laddar...</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			{/* Week navigation */}
			<div className="flex items-center justify-between">
				<Button variant="outline" size="icon" onClick={handlePrevWeek}>
					◀
				</Button>
				<div className="text-center">
					<p className="font-semibold">
						Vecka {weekNumber}, {weekStart.getFullYear()}
					</p>
					<p className="text-sm text-muted-foreground">
						{formatDate(weekDays[0])} - {formatDate(weekDays[6])}
					</p>
				</div>
				<Button variant="outline" size="icon" onClick={handleNextWeek}>
					▶
				</Button>
			</div>

			{/* Today button - only show when not on current week */}
			{!isCurrentWeek() && (
				<Button variant="outline" className="w-full" onClick={handleToday}>
					Idag
				</Button>
			)}

			{/* Mobile: Project selector + single project grid */}
			<div className="md:hidden space-y-4">
				<Select
					value={selectedProjectId}
					onChange={(e) => setSelectedProjectId(e.target.value)}
				>
					{projects.map((project) => (
						<option key={project.id} value={project.id}>
							{project.name}
						</option>
					))}
				</Select>

				{selectedProject && (
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-base flex justify-between">
								<span>{selectedProject.name}</span>
								<span className="text-muted-foreground">
									{formatMinutes(getProjectTotal(selectedProjectId))}
								</span>
							</CardTitle>
							{selectedProject.hourlyRate && (
								<p className="text-sm text-muted-foreground">
									{selectedProject.hourlyRate / 100} kr/h
								</p>
							)}
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-3 gap-2">
								{weekDays.map((day) => {
									const dateKey = toDateString(day)
									const entry = weekData[selectedProjectId]?.[dateKey]
									const value = entry?.minutes
										? formatMinutes(entry.minutes, 'time')
										: ''
									const inputId = `time-${dateKey}`
									const redDay = isRedDay(day)
									const holidayName = getHolidayName(day)

									return (
										<div key={dateKey} className="space-y-1">
											<label
												htmlFor={inputId}
												className={cn(
													'text-xs block text-center',
													redDay
														? 'text-red-500 font-medium'
														: 'text-muted-foreground',
												)}
												title={holidayName}
											>
												{formatDate(day, 'weekday')}
											</label>
											<Input
												id={inputId}
												type="text"
												inputMode="decimal"
												placeholder="-"
												value={value}
												onChange={(e) =>
													handleTimeChange(
														selectedProjectId,
														dateKey,
														e.target.value,
													)
												}
												className={cn(
													'text-center h-12 text-lg',
													redDay && 'bg-red-50 border-red-200',
												)}
											/>
										</div>
									)
								})}
							</div>
						</CardContent>
					</Card>
				)}
			</div>

			{/* Desktop: Full grid */}
			<div className="hidden md:block">
				<Card>
					<CardContent className="p-0 overflow-x-auto">
						<table className="w-full">
							<thead>
								<tr className="border-b">
									<th className="text-left p-3 min-w-[200px]">Projekt</th>
									{weekDays.map((day) => {
										const redDay = isRedDay(day)
										const holidayName = getHolidayName(day)
										return (
											<th
												key={day.toISOString()}
												className={cn(
													'text-center p-3 min-w-[80px]',
													redDay && 'bg-red-50',
												)}
												title={holidayName}
											>
												<div
													className={cn(redDay && 'text-red-500 font-medium')}
												>
													{formatDate(day, 'weekday')}
												</div>
												{holidayName && (
													<div className="text-xs text-red-400 font-normal truncate max-w-[80px]">
														{holidayName}
													</div>
												)}
											</th>
										)
									})}
									<th className="text-center p-3 min-w-[80px]">Totalt</th>
								</tr>
							</thead>
							<tbody>
								{projects.map((project) => (
									<tr key={project.id} className="border-b">
										<td className="p-3">
											<div className="font-medium">{project.name}</div>
											{project.hourlyRate && (
												<div className="text-sm text-muted-foreground">
													{project.hourlyRate / 100} kr/h
												</div>
											)}
										</td>
										{weekDays.map((day) => {
											const dateKey = toDateString(day)
											const entry = weekData[project.id]?.[dateKey]
											const value = entry?.minutes
												? formatMinutes(entry.minutes, 'time')
												: ''
											const redDay = isRedDay(day)

											return (
												<td
													key={dateKey}
													className={cn('p-2', redDay && 'bg-red-50')}
												>
													<Input
														type="text"
														inputMode="decimal"
														placeholder="-"
														value={value}
														onChange={(e) =>
															handleTimeChange(
																project.id,
																dateKey,
																e.target.value,
															)
														}
														className={cn(
															'text-center w-full',
															redDay && 'border-red-200',
														)}
													/>
												</td>
											)
										})}
										<td className="p-3 text-center font-medium">
											{formatMinutes(getProjectTotal(project.id), 'time')}
										</td>
									</tr>
								))}
								<tr className="bg-muted/50 font-medium">
									<td className="p-3">Dagstotal</td>
									{weekDays.map((day) => {
										const dateKey = toDateString(day)
										const redDay = isRedDay(day)
										return (
											<td
												key={dateKey}
												className={cn(
													'p-3 text-center',
													redDay && 'bg-red-100/50',
												)}
											>
												{formatMinutes(getDayTotal(dateKey), 'time')}
											</td>
										)
									})}
									<td className="p-3 text-center">
										{formatMinutes(getWeekTotal(), 'time')}
									</td>
								</tr>
							</tbody>
						</table>
					</CardContent>
				</Card>
			</div>

			{/* Summary for all projects (mobile) */}
			<Card className="md:hidden">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Veckans totaler</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						{projects.map((project) => {
							const total = getProjectTotal(project.id)
							if (total === 0) return null
							return (
								<div key={project.id} className="flex justify-between text-sm">
									<span>{project.name}</span>
									<span className="font-medium">{formatMinutes(total)}</span>
								</div>
							)
						})}
						<div className="border-t pt-2 flex justify-between font-medium">
							<span>Totalt</span>
							<span>{formatMinutes(getWeekTotal())}</span>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Save button */}
			<Button
				onClick={handleSave}
				disabled={!hasChanges || isSaving}
				className="w-full"
			>
				{isSaving ? 'Sparar...' : 'Spara ändringar'}
			</Button>

			{projects.length === 0 && (
				<Card>
					<CardContent className="py-8 text-center">
						<p className="text-muted-foreground">
							Inga aktiva projekt. Skapa ett projekt först.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
