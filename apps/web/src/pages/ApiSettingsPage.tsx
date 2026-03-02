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
	const [message, setMessage] = useState<{
		type: 'success' | 'error'
		text: string
	} | null>(null)

	useEffect(() => {
		async function checkToken() {
			const response = await api.getBoxTokenStatus()
			if (response.success && response.data) {
				setHasToken(response.data.hasToken)
			}
		}
		checkToken()
	}, [])

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault()
		setIsSaving(true)
		setMessage(null)

		const response = await api.saveBoxToken(token)
		if (response.success) {
			setMessage({ type: 'success', text: 'Token sparad!' })
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

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-bold">API inställningar</h1>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">BOX API</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="mb-4">
						{hasToken === null ? (
							<p className="text-sm text-muted-foreground">Laddar...</p>
						) : hasToken ? (
							<p className="text-sm text-green-600">✓ Token konfigurerad</p>
						) : (
							<p className="text-sm text-muted-foreground">
								Ingen token konfigurerad
							</p>
						)}
					</div>

					<form onSubmit={handleSave} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="box-token">BOX API token</Label>
							<Input
								id="box-token"
								type="password"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="Ange din BOX API token"
							/>
						</div>

						{message && (
							<p
								className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
							>
								{message.text}
							</p>
						)}

						<Button type="submit" disabled={isSaving || !token.trim()}>
							{isSaving ? 'Sparar...' : 'Spara'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
}
