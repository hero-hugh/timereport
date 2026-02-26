import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { api } from '../lib/api'

export function ProjectFormPage() {
	const { id } = useParams()
	const navigate = useNavigate()
	const isEditing = !!id

	const [name, setName] = useState('')
	const [description, setDescription] = useState('')
	const [hourlyRate, setHourlyRate] = useState('')
	const [startDate, setStartDate] = useState(() => {
		return new Date().toISOString().split('T')[0]
	})
	const [endDate, setEndDate] = useState('')
	const [isActive, setIsActive] = useState(true)

	const [isLoading, setIsLoading] = useState(false)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState('')

	useEffect(() => {
		if (id) {
			setIsLoading(true)
			api.getProject(id).then((response) => {
				if (response.success && response.data) {
					const p = response.data
					setName(p.name)
					setDescription(p.description || '')
					setHourlyRate(p.hourlyRate ? String(p.hourlyRate / 100) : '')
					setStartDate(p.startDate.split('T')[0])
					setEndDate(p.endDate ? p.endDate.split('T')[0] : '')
					setIsActive(p.isActive)
				}
				setIsLoading(false)
			})
		}
	}, [id])

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError('')
		setIsSaving(true)

		const data = {
			name,
			description: description || undefined,
			hourlyRate: hourlyRate ? Number(hourlyRate) * 100 : undefined,
			startDate,
			endDate: endDate || null,
			...(isEditing && { isActive }),
		}

		try {
			const response =
				isEditing && id
					? await api.updateProject(id, data)
					: await api.createProject(data)

			if (response.success) {
				navigate('/projects')
			} else {
				setError(response.error || 'Något gick fel')
			}
		} catch {
			setError('Kunde inte spara projektet')
		} finally {
			setIsSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!id) return
		if (!confirm('Är du säker på att du vill ta bort projektet?')) return

		const response = await api.deleteProject(id)
		if (response.success) {
			navigate('/projects')
		} else {
			setError(response.error || 'Kunde inte ta bort projektet')
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
		<div className="max-w-lg mx-auto">
			<div className="flex items-center gap-4 mb-6">
				<Button variant="ghost" onClick={() => navigate(-1)}>
					← Tillbaka
				</Button>
				<h1 className="text-xl font-bold">
					{isEditing ? 'Redigera projekt' : 'Nytt projekt'}
				</h1>
			</div>

			<Card>
				<CardContent className="pt-6">
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Projektnamn *</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								required
								placeholder="T.ex. Kundprojekt ABC"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Beskrivning</Label>
							<Input
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Valfri beskrivning"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="hourlyRate">Timpris (kr)</Label>
							<Input
								id="hourlyRate"
								type="number"
								min="0"
								step="1"
								value={hourlyRate}
								onChange={(e) => setHourlyRate(e.target.value)}
								placeholder="T.ex. 850"
							/>
							<p className="text-sm text-muted-foreground">
								Lämna tomt om inget timpris
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor="startDate">Startdatum *</Label>
							<Input
								id="startDate"
								type="date"
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="endDate">Slutdatum</Label>
							<Input
								id="endDate"
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
							/>
							<p className="text-sm text-muted-foreground">
								Lämna tomt för "tills vidare"
							</p>
						</div>

						{isEditing && (
							<div className="flex items-center gap-2">
								<input
									type="checkbox"
									id="isActive"
									checked={isActive}
									onChange={(e) => setIsActive(e.target.checked)}
									className="rounded"
								/>
								<Label htmlFor="isActive">Projektet är aktivt</Label>
							</div>
						)}

						{error && <p className="text-sm text-destructive">{error}</p>}

						<Button type="submit" className="w-full" disabled={isSaving}>
							{isSaving
								? 'Sparar...'
								: isEditing
									? 'Spara ändringar'
									: 'Skapa projekt'}
						</Button>
					</form>
				</CardContent>
			</Card>

			{isEditing && (
				<Button
					variant="destructive"
					className="w-full mt-4"
					onClick={handleDelete}
				>
					Ta bort projekt
				</Button>
			)}
		</div>
	)
}
