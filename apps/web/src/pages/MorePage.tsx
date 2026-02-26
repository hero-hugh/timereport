import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { useAuth } from '../hooks/useAuth'

export function MorePage() {
	const { user, logout } = useAuth()
	const navigate = useNavigate()

	const handleLogout = async () => {
		await logout()
		navigate('/login')
	}

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-bold">Mer</h1>

			<Card>
				<CardContent className="p-4">
					<div className="flex items-center gap-3">
						<div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-xl">
							👤
						</div>
						<div>
							<p className="font-medium">{user?.email}</p>
							<p className="text-sm text-muted-foreground">
								{user?.name || 'Ingen profil konfigurerad'}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-0">
					<Link
						to="/reports"
						className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
					>
						<div className="flex items-center gap-3">
							<span className="text-xl">📊</span>
							<span>Rapporter</span>
						</div>
						<span className="text-muted-foreground">→</span>
					</Link>
				</CardContent>
			</Card>

			<div className="pt-4">
				<Button variant="outline" className="w-full" onClick={handleLogout}>
					🚪 Logga ut
				</Button>
			</div>

			<p className="text-center text-sm text-muted-foreground">Version 1.0.0</p>
		</div>
	)
}
