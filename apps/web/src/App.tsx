import {
	Navigate,
	Outlet,
	RouterProvider,
	createBrowserRouter,
} from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './hooks/useAuth'
import { ApiSettingsPage } from './pages/ApiSettingsPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MorePage } from './pages/MorePage'
import { ProjectFormPage } from './pages/ProjectFormPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ReportsPage } from './pages/ReportsPage'
import { TimePage } from './pages/TimePage'

function AuthLayout() {
	return (
		<AuthProvider>
			<Outlet />
		</AuthProvider>
	)
}

const router = createBrowserRouter([
	{
		element: <AuthLayout />,
		children: [
			{ path: '/login', element: <LoginPage /> },
			{
				path: '/',
				element: (
					<ProtectedRoute>
						<Layout />
					</ProtectedRoute>
				),
				children: [
					{ index: true, element: <DashboardPage /> },
					{ path: 'time', element: <TimePage /> },
					{ path: 'projects', element: <ProjectsPage /> },
					{ path: 'projects/new', element: <ProjectFormPage /> },
					{ path: 'projects/:id', element: <ProjectFormPage /> },
					{ path: 'reports', element: <ReportsPage /> },
					{ path: 'api-settings', element: <ApiSettingsPage /> },
					{ path: 'more', element: <MorePage /> },
				],
			},
			{ path: '*', element: <Navigate to="/" replace /> },
		],
	},
])

function App() {
	return <RouterProvider router={router} />
}

export default App
