import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react'
import { api } from '../lib/api'

interface User {
	id: string
	email: string
	name: string | null
}

interface AuthContextType {
	user: User | null
	isLoading: boolean
	isAuthenticated: boolean
	login: (
		email: string,
		code: string,
	) => Promise<{ success: boolean; error?: string }>
	logout: () => Promise<void>
	refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<User | null>(null)
	const [isLoading, setIsLoading] = useState(true)

	const refreshUser = useCallback(async () => {
		try {
			const response = await api.getMe()
			if (response.success && response.data) {
				setUser({
					id: response.data.id,
					email: response.data.email,
					name: response.data.name,
				})
			} else {
				setUser(null)
			}
		} catch {
			setUser(null)
		}
	}, [])

	useEffect(() => {
		refreshUser().finally(() => setIsLoading(false))
	}, [refreshUser])

	const login = async (
		email: string,
		code: string,
	): Promise<{ success: boolean; error?: string }> => {
		const response = await api.verifyOtp(email, code)
		if (response.success && response.data) {
			setUser(response.data.user)
			return { success: true }
		}
		return {
			success: false,
			error: response.error || 'Inloggning misslyckades',
		}
	}

	const logout = async () => {
		await api.logout()
		setUser(null)
	}

	return (
		<AuthContext.Provider
			value={{
				user,
				isLoading,
				isAuthenticated: !!user,
				login,
				logout,
				refreshUser,
			}}
		>
			{children}
		</AuthContext.Provider>
	)
}

export function useAuth() {
	const context = useContext(AuthContext)
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider')
	}
	return context
}
