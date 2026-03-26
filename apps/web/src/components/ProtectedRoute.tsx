import { Loader2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface ProtectedRouteProps {
	children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
	const { isAuthenticated, isLoading } = useAuth()

	if (isLoading) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
					<p className="text-muted-foreground">Laddar...</p>
				</div>
			</div>
		)
	}

	if (!isAuthenticated) {
		return <Navigate to="/login" replace />
	}

	return <>{children}</>
}
