import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { api } from '../lib/api'
import { formatCurrency, formatDate, formatMinutes } from '../lib/utils'

interface Project {
	id: string
	name: string
	description: string | null
	hourlyRate: number | null
	startDate: string
	endDate: string | null
	isActive: boolean
	totalMinutes: number
	totalAmount: number | null
}

export function ProjectsPage() {
	const [projects, setProjects] = useState<Project[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [showInactive, setShowInactive] = useState(false)
	const [search, setSearch] = useState('')

	useEffect(() => {
		async function loadProjects() {
			const response = await api.getProjects(showInactive)
			if (response.success && response.data) {
				setProjects(response.data)
			}
			setIsLoading(false)
		}
		loadProjects()
	}, [showInactive])

	const filteredProjects = projects.filter((p) =>
		p.name.toLowerCase().includes(search.toLowerCase()),
	)

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-64">
				<p className="text-muted-foreground">Laddar...</p>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Projekt</h1>
				<Link to="/projects/new">
					<Button>+ Nytt</Button>
				</Link>
			</div>

			<Input
				placeholder="Sök projekt..."
				value={search}
				onChange={(e) => setSearch(e.target.value)}
			/>

			<div className="flex gap-2">
				<Button
					variant={!showInactive ? 'default' : 'outline'}
					size="sm"
					onClick={() => setShowInactive(false)}
				>
					Aktiva
				</Button>
				<Button
					variant={showInactive ? 'default' : 'outline'}
					size="sm"
					onClick={() => setShowInactive(true)}
				>
					Alla
				</Button>
			</div>

			<div className="space-y-3">
				{filteredProjects.map((project) => (
					<Link key={project.id} to={`/projects/${project.id}`}>
						<Card className="hover:bg-muted/50 transition-colors">
							<CardContent className="p-4">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-2">
											<span
												className={`w-2 h-2 rounded-full ${
													project.isActive ? 'bg-green-500' : 'bg-gray-400'
												}`}
											/>
											<h3 className="font-medium">{project.name}</h3>
										</div>
										<p className="text-sm text-muted-foreground mt-1">
											Startat: {formatDate(project.startDate)}
											{project.endDate &&
												` • Slut: ${formatDate(project.endDate)}`}
										</p>
									</div>
									<span className="text-muted-foreground">→</span>
								</div>
								<div className="mt-3 pt-3 border-t flex justify-between text-sm">
									<span>{formatMinutes(project.totalMinutes)}</span>
									<span>
										{project.totalAmount !== null
											? formatCurrency(project.totalAmount)
											: 'Inget timpris'}
									</span>
								</div>
							</CardContent>
						</Card>
					</Link>
				))}

				{filteredProjects.length === 0 && (
					<Card>
						<CardContent className="py-8 text-center">
							<p className="text-muted-foreground">
								{search
									? 'Inga projekt matchade sökningen'
									: 'Inga projekt ännu'}
							</p>
							{!search && (
								<Link
									to="/projects/new"
									className="text-primary hover:underline mt-2 inline-block"
								>
									Skapa ditt första projekt →
								</Link>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	)
}
