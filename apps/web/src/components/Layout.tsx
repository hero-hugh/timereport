import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'

const navItems = [
	{ to: '/', label: 'Hem', icon: '📊' },
	{ to: '/time', label: 'Tid', icon: '⏱️' },
	{ to: '/projects', label: 'Projekt', icon: '📁' },
	{ to: '/more', label: 'Mer', icon: '⚙️' },
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
						<span className="text-2xl mr-2">⏱</span>
						<span className="font-semibold">Tidrapport</span>
					</div>
					<nav className="flex-1 px-2 py-4 space-y-1">
						{navItems.map((item) => (
							<NavLink
								key={item.to}
								to={item.to}
								className={({ isActive }) =>
									cn(
										'flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
										isActive
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground',
									)
								}
							>
								<span className="mr-3">{item.icon}</span>
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
							<span className="text-xl mr-2">⏱</span>
							<span className="font-semibold">Tidrapport</span>
						</div>
					</div>
				</header>

				{/* Page content */}
				<div className="p-4 pb-20 md:pb-4">
					<Outlet />
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
									'flex flex-col items-center py-2 px-4 text-xs',
									isActive ? 'text-primary' : 'text-muted-foreground',
								)
							}
						>
							<span className="text-xl mb-1">{item.icon}</span>
							{item.label}
						</NavLink>
					))}
				</div>
			</nav>
		</div>
	)
}
