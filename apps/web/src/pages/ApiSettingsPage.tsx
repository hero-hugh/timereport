import { useEffect, useState } from 'react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { api } from '../lib/api'

export function ApiSettingsPage() {
	const [token, setToken] = useState('')
	const [hasToken, setHasToken] = useState<boolean | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [isLoading, setIsLoading] = useState(true)
	const [message, setMessage] = useState<{
		type: 'success' | 'error'
		text: string
	} | null>(null)

	useEffect(() => {
		async function checkTokenStatus() {
			const response = await api.getBoxTokenStatus()
			if (response.success && response.data) {
				setHasToken(response.data.hasToken)
			}
			setIsLoading(false)
		}
		checkTokenStatus()
	}, [])

	const handleSave = async () => {
		if (!token.trim()) return
		setIsSaving(true)
		setMessage(null)
		const response = await api.saveBoxToken(token)
		if (response.success) {
			setMessage({ type: 'success', text: 'Token sparad' })
			setHasToken(true)
			setToken('')
		} else {
			setMessage({
				type: 'error',
				text: response.error || 'Kunde inte spara token',
			})
		}
		setIsSaving(false)
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
			<h1 className="text-2xl font-bold">API inställningar</h1>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">BOX API token</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							{hasToken ? 'Token konfigurerad' : 'Ingen token konfigurerad'}
						</p>

						<div className="space-y-2">
							<Label htmlFor="box-token">
								{hasToken ? 'Uppdatera token' : 'Ange token'}
							</Label>
							<Input
								id="box-token"
								type="password"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="Klistra in din BOX API token"
							/>
						</div>

						{message && (
							<p
								className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
							>
								{message.text}
							</p>
						)}

						<Button
							onClick={handleSave}
							disabled={isSaving || !token.trim()}
							className="w-full"
						>
							{isSaving ? 'Sparar...' : 'Spara token'}
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
