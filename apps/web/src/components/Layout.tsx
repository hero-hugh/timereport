import {
	Clock,
	FolderOpen,
	LayoutDashboard,
	type LucideIcon,
	Menu,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

const navItems: { to: string; label: string; icon: LucideIcon }[] = [
	{ to: '/', label: 'Hem', icon: LayoutDashboard },
	{ to: '/time', label: 'Tid', icon: Clock },
	{ to: '/projects', label: 'Projekt', icon: FolderOpen },
	{ to: '/more', label: 'Mer', icon: Menu },
]

export function Layout() {
	const { user, logout } = useAuth()
	const navigate = useNavigate()

	const handleLogout = async () => {
		await logout()
		navigate('/login')
	}

	return (
		<div className="min-h-screen flex flex-col md:flex-row">
			{/* Desktop sidebar */}
			<aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r bg-card">
				<div className="flex flex-col flex-1 min-h-0">
					<div className="flex items-center h-16 px-4 border-b">
						<Clock className="h-6 w-6 mr-2" />
						<span className="font-semibold">Tidrapport</span>
					</div>
					<nav className="flex-1 px-2 py-4 space-y-1">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								className={({ isActive }) =>
									cn(
										'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all duration-150 ease-out-expo active:scale-[0.97]',
										isActive
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground',
									)
								}
							>
								<item.icon className="h-5 w-5 mr-3" />
								{item.label}
							</NavLink>
						))}
					</nav>
					<div className="p-4 border-t">
						<p className="text-sm text-muted-foreground truncate">
							{user?.email}
						</p>
						<button
							type="button"
							onClick={handleLogout}
							className="mt-2 text-sm text-muted-foreground hover:text-foreground"
						>
							Logga ut
						</button>
					</div>
				</div>
			</aside>

			{/* Main content */}
			<main className="flex-1 md:pl-64">
				{/* Mobile header */}
				<header className="md:hidden sticky top-0 z-10 bg-background border-b">
					<div className="flex items-center justify-between h-14 px-4">
						<div className="flex items-center">
							<Clock className="h-5 w-5 mr-2" />
							<span className="font-semibold">Tidrapport</span>
						</div>
					</div>
				</header>

				{/* Page content */}
				<div className="p-4 pb-20 md:pb-4">
					<div className="animate-fade-in">
						<Outlet />
					</div>
				</div>
			</main>

			{/* Mobile bottom navigation */}
			<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t">
				<div className="flex justify-around">
					{navItems.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) =>
								cn(
									'flex flex-col items-center py-2 px-4 text-xs transition-all duration-150 ease-out-expo active:scale-95',
									isActive ? 'text-primary' : 'text-muted-foreground',
								)
							}
						>
							<item.icon className="h-5 w-5 mb-1" />
							{item.label}
						</NavLink>
					))}
				</div>
			</nav>
		</div>
	)
}
