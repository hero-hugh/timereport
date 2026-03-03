import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ProfileEditDialog } from '../components/ProfileEditDialog'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { useAuth } from '../hooks/useAuth'

export function MorePage() {
	const { user, logout, refreshUser } = useAuth()
	const navigate = useNavigate()
	const [profileDialogOpen, setProfileDialogOpen] = useState(false)

	const handleLogout = async () => {
		await logout()
		navigate('/login')
	}

	const profileName =
		user?.firstName && user?.lastName
			? `${user.firstName} ${user.lastName}`
			: null

	return (
		<div className="space-y-4">
			<h1 className="text-2xl font-bold">Mer</h1>

			<Card>
				<CardContent className="p-0">
					<button
						type="button"
						className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
						onClick={() => setProfileDialogOpen(true)}
					>
						<div className="flex items-center gap-3">
							<div className="w-12 h-12 shrink-0 bg-primary/10 rounded-full flex items-center justify-center text-xl">
								👤
							</div>
							<div className="flex-1 min-w-0">
								<p className="font-medium truncate">{user?.email}</p>
								<p className="text-sm text-muted-foreground">
									{profileName || 'Ingen profil konfigurerad'}
								</p>
							</div>
							<span className="text-sm text-muted-foreground shrink-0">
								<span className="hidden sm:inline">Redigera profil </span>→
							</span>
						</div>
					</button>
				</CardContent>
			</Card>

			<ProfileEditDialog
				open={profileDialogOpen}
				onClose={() => setProfileDialogOpen(false)}
				onSaved={refreshUser}
				initialFirstName={user?.firstName}
				initialLastName={user?.lastName}
			/>

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

			<Card>
				<CardContent className="p-0">
					<Link
						to="/api-settings"
						className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
					>
						<div className="flex items-center gap-3">
							<span className="text-xl">🔑</span>
							<span>API inställningar</span>
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
