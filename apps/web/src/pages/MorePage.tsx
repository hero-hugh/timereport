import { BarChart3, ChevronRight, Key, LogOut, User } from 'lucide-react'
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

			<Card className="animate-fade-in-up">
				<CardContent className="p-0">
					<button
						type="button"
						className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
						onClick={() => setProfileDialogOpen(true)}
					>
						<div className="flex items-center gap-3">
							<div className="w-12 h-12 shrink-0 bg-primary/10 rounded-full flex items-center justify-center">
								<User className="h-6 w-6 text-primary" />
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

			<Card className="animate-fade-in-up stagger-1">
				<CardContent className="p-0">
					<Link
						to="/reports"
						className="flex items-center justify-between p-4 hover:bg-muted/50 transition-all duration-150 ease-out-expo active:scale-[0.98]"
					>
						<div className="flex items-center gap-3">
							<BarChart3 className="h-5 w-5" />
							<span>Rapporter</span>
						</div>
						<ChevronRight className="h-5 w-5 text-muted-foreground" />
					</Link>
				</CardContent>
			</Card>

			<Card className="animate-fade-in-up stagger-2">
				<CardContent className="p-0">
					<Link
						to="/api-settings"
						className="flex items-center justify-between p-4 hover:bg-muted/50 transition-all duration-150 ease-out-expo active:scale-[0.98]"
					>
						<div className="flex items-center gap-3">
							<Key className="h-5 w-5" />
							<span>API inställningar</span>
						</div>
						<ChevronRight className="h-5 w-5 text-muted-foreground" />
					</Link>
				</CardContent>
			</Card>

			<div className="pt-4 animate-fade-in-up stagger-3">
				<Button variant="outline" className="w-full" onClick={handleLogout}>
					<LogOut className="h-4 w-4 mr-2" />
					Logga ut
				</Button>
			</div>

			<p className="text-center text-sm text-muted-foreground">Version 1.0.0</p>
		</div>
	)
}
