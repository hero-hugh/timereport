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
	const [isExporting, setIsExporting] = useState(false)
	const [isSendingToBox, setIsSendingToBox] = useState(false)
	const [boxResult, setBoxResult] = useState<{
		success: boolean
		message: string
	} | null>(null)

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

	useEffect(() => {
		if (boxResult?.success) {
			const timer = setTimeout(() => setBoxResult(null), 3000)
			return () => clearTimeout(timer)
		}
	}, [boxResult])

	const handleExportPdf = async () => {
		if (!summary) return
		setIsExporting(true)
		try {
			const [yearStr, monthStr] = summary.period.from.split('-')
			const year = Number(yearStr)
			const month = Number(monthStr)
			const result = await api.downloadPdfReport({ year, month })
			if (result.success) {
				const url = URL.createObjectURL(result.blob)
				const a = document.createElement('a')
				a.href = url
				a.download = `tidrapport-${year}-${String(month).padStart(2, '0')}.pdf`
				a.click()
				URL.revokeObjectURL(url)
			}
		} finally {
			setIsExporting(false)
		}
	}

	const handleSendToBox = async () => {
		if (!summary) return
		setIsSendingToBox(true)
		setBoxResult(null)
		try {
			const [yearStr, monthStr] = summary.period.from.split('-')
			const year = Number(yearStr)
			const month = Number(monthStr)
			const result = await api.sendToBox({ year, month })
			if (result.success) {
				setBoxResult({ success: true, message: 'Tidrapport skickad till BOX' })
			} else {
				setBoxResult({
					success: false,
					message: result.error || 'Kunde inte skicka till BOX',
				})
			}
		} catch (error) {
			const isNetworkError =
				error instanceof TypeError ||
				(error instanceof Error && error.message === 'Failed to fetch')
			setBoxResult({
				success: false,
				message: isNetworkError
					? 'Nätverksfel - försök igen'
					: 'Kunde inte skicka till BOX',
			})
		} finally {
			setIsSendingToBox(false)
		}
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

					<div className="flex flex-col gap-2">
						<Button
							className="w-full"
							onClick={handleExportPdf}
							disabled={isExporting}
						>
							{isExporting ? 'Exporterar...' : 'Exportera till PDF'}
						</Button>
						<Button
							className="w-full"
							onClick={handleSendToBox}
							disabled={isSendingToBox}
						>
							{isSendingToBox ? 'Skickar...' : 'Skicka till BOX'}
						</Button>
					</div>

					{boxResult && (
						<div
							className={`rounded-lg border p-4 flex items-start justify-between gap-2 ${
								boxResult.success
									? 'bg-green-50 border-green-200 text-green-800'
									: boxResult.message.includes('Profil saknas')
										? 'bg-amber-50 border-amber-300 text-amber-900'
										: 'bg-red-50 border-red-200 text-red-800'
							}`}
						>
							<p className="text-sm">
								{boxResult.success ? '✓ ' : ''}
								{boxResult.message.includes('Profil saknas') ? (
									<strong>{boxResult.message}</strong>
								) : (
									boxResult.message
								)}
							</p>
							<button
								type="button"
								className="text-sm font-medium hover:opacity-70"
								onClick={() => setBoxResult(null)}
							>
								×
							</button>
						</div>
					)}
				</>
			)}
		</div>
	)
}
