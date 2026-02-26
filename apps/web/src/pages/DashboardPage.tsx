import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { formatDate, formatMinutes } from '../lib/utils'

interface DashboardStats {
	weekMinutes: number
	monthMinutes: number
	monthTotalMinutes: number
	activeProjectsCount: number
	recentEntries: Array<{
		id: string
		date: string
		minutes: number
		project: { id: string; name: string }
	}>
}

export function DashboardPage() {
	const { user } = useAuth()
	const [stats, setStats] = useState<DashboardStats | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		async function loadStats() {
			const response = await api.getDashboardStats()
			if (response.success && response.data) {
				setStats(response.data)
			}
			setIsLoading(false)
		}
		loadStats()
	}, [])

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<p className="text-muted-foreground">Laddar...</p>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">
					Hej{user?.name ? `, ${user.name}` : ''}! 👋
				</h1>
				<p className="text-muted-foreground">Här är en översikt av din tid</p>
			</div>

			{/* Stats cards */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Denna vecka
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							{stats ? formatMinutes(stats.weekMinutes) : '-'}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Denna månad
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							{stats ? formatMinutes(stats.monthMinutes) : '-'}
						</p>
						{stats && (
							<p className="text-sm text-muted-foreground">
								av {formatMinutes(stats.monthTotalMinutes)}
							</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Aktiva projekt
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-2xl font-bold">
							{stats?.activeProjectsCount ?? 0}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Quick actions */}
			<div className="flex gap-2">
				<Link
					to="/time"
					className="flex-1 bg-primary text-primary-foreground rounded-md py-3 text-center font-medium hover:bg-primary/90 transition-colors"
				>
					Rapportera tid
				</Link>
				<Link
					to="/projects"
					className="flex-1 bg-secondary text-secondary-foreground rounded-md py-3 text-center font-medium hover:bg-secondary/80 transition-colors"
				>
					Visa projekt
				</Link>
			</div>

			{/* Recent entries */}
			{stats && stats.recentEntries.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="text-lg">Senaste tidrapporter</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{stats.recentEntries.map((entry) => (
								<div
									key={entry.id}
									className="flex items-center justify-between py-2 border-b last:border-0"
								>
									<div>
										<p className="font-medium">{entry.project.name}</p>
										<p className="text-sm text-muted-foreground">
											{formatDate(entry.date, 'long')}
										</p>
									</div>
									<p className="font-medium">{formatMinutes(entry.minutes)}</p>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{stats && stats.recentEntries.length === 0 && (
				<Card>
					<CardContent className="py-8 text-center">
						<p className="text-muted-foreground">Inga tidrapporter ännu.</p>
						<Link
							to="/time"
							className="text-primary hover:underline mt-2 inline-block"
						>
							Börja rapportera tid →
						</Link>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
