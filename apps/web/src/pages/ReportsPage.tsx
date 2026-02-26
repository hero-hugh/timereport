import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { api } from '../lib/api'
import { formatCurrency, formatMinutes, toDateString } from '../lib/utils'

interface ReportSummary {
	totalMinutes: number
	totalAmount: number
	projects: Array<{
		projectId: string
		projectName: string
		hourlyRate: number | null
		totalMinutes: number
		totalAmount: number | null
	}>
	period: { from: string; to: string }
}

type PeriodType = 'this-month' | 'last-month' | 'custom'

export function ReportsPage() {
	const [period, setPeriod] = useState<PeriodType>('this-month')
	const [summary, setSummary] = useState<ReportSummary | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		async function loadReport() {
			setIsLoading(true)
			const now = new Date()
			let from: Date
			let to: Date

			if (period === 'this-month') {
				from = new Date(now.getFullYear(), now.getMonth(), 1)
				to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
			} else if (period === 'last-month') {
				from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
				to = new Date(now.getFullYear(), now.getMonth(), 0)
			} else {
				from = new Date(now.getFullYear(), now.getMonth(), 1)
				to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
			}

			const fromStr = toDateString(from)
			const toStr = toDateString(to)

			const response = await api.getReportSummary({ from: fromStr, to: toStr })
			if (response.success && response.data) {
				setSummary(response.data)
			}
			setIsLoading(false)
		}
		loadReport()
	}, [period])

	const getPeriodLabel = () => {
		if (!summary) return ''
		const [yearStr, monthStr] = summary.period.from.split('-')
		const year = Number(yearStr)
		const month = Number(monthStr)
		const from = new Date(year, month - 1, 1)
		return from.toLocaleDateString('sv-SE', {
			month: 'long',
			year: 'numeric',
		})
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
			<h1 className="text-2xl font-bold">Rapporter</h1>

			<div className="space-y-2">
				<p className="text-sm font-medium">Period</p>
				<div className="flex gap-2">
					<Button
						variant={period === 'this-month' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setPeriod('this-month')}
					>
						Denna månad
					</Button>
					<Button
						variant={period === 'last-month' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setPeriod('last-month')}
					>
						Förra månaden
					</Button>
				</div>
			</div>

			{summary && (
				<>
					<Card>
						<CardHeader className="pb-2">
							<CardTitle className="text-lg">
								Totalt - {getPeriodLabel()}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="text-sm text-muted-foreground">Tid</p>
									<p className="text-2xl font-bold">
										{formatMinutes(summary.totalMinutes)}
									</p>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Belopp</p>
									<p className="text-2xl font-bold">
										{formatCurrency(summary.totalAmount)}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-lg">Per projekt</CardTitle>
						</CardHeader>
						<CardContent>
							{summary.projects.length === 0 ? (
								<p className="text-muted-foreground text-center py-4">
									Ingen tid rapporterad denna period
								</p>
							) : (
								<div className="space-y-3">
									{summary.projects.map((project) => (
										<div
											key={project.projectId}
											className="flex items-center justify-between py-2 border-b last:border-0"
										>
											<div>
												<p className="font-medium">{project.projectName}</p>
												{project.hourlyRate && (
													<p className="text-sm text-muted-foreground">
														{project.hourlyRate / 100} kr/h
													</p>
												)}
											</div>
											<div className="text-right">
												<p className="font-medium">
													{formatMinutes(project.totalMinutes)}
												</p>
												<p className="text-sm text-muted-foreground">
													{project.totalAmount !== null
														? formatCurrency(project.totalAmount)
														: '-'}
												</p>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</>
			)}
		</div>
	)
}
