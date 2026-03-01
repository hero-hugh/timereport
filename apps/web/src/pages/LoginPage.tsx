import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../components/ui/card'
import { Input } from '../components/ui/input'
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSlot,
} from '../components/ui/input-otp'
import { Label } from '../components/ui/label'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'

type Step = 'email' | 'otp'

export function LoginPage() {
	const [step, setStep] = useState<Step>('email')
	const [email, setEmail] = useState('')
	const [code, setCode] = useState('')
	const [error, setError] = useState('')
	const [isLoading, setIsLoading] = useState(false)

	const { login } = useAuth()
	const navigate = useNavigate()

	const handleRequestOtp = async (e: React.FormEvent) => {
		e.preventDefault()
		setError('')
		setIsLoading(true)

		try {
			const response = await api.requestOtp(email)
			if (response.success) {
				setStep('otp')
			} else {
				setError(response.error || 'Kunde inte skicka kod')
			}
		} catch {
			setError('Ett fel uppstod, försök igen')
		} finally {
			setIsLoading(false)
		}
	}

	const handleVerifyOtp = async (e?: React.FormEvent) => {
		e?.preventDefault()
		if (code.length !== 6) return

		setError('')
		setIsLoading(true)

		try {
			const result = await login(email, code)
			if (result.success) {
				navigate('/')
			} else {
				setError(result.error || 'Felaktig kod')
			}
		} catch {
			setError('Ett fel uppstod, försök igen')
		} finally {
			setIsLoading(false)
		}
	}

	const handleCodeChange = (value: string) => {
		setCode(value)
	}

	const handleCodeComplete = (value: string) => {
		setCode(value)
		// Auto-submit when 6 digits are entered
		handleVerifyOtp()
	}

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-4 bg-muted/50">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 text-4xl">⏱</div>
					<CardTitle className="text-2xl">Tidrapportering</CardTitle>
					<CardDescription>
						{step === 'email'
							? 'Ange din e-postadress för att logga in'
							: `Vi skickade en kod till ${email}`}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{step === 'email' ? (
						<form onSubmit={handleRequestOtp} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="email">E-post</Label>
								<Input
									id="email"
									type="email"
									placeholder="din@email.se"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									required
									autoFocus
									autoComplete="email"
								/>
							</div>
							{error && <p className="text-sm text-destructive">{error}</p>}
							<Button type="submit" className="w-full" disabled={isLoading}>
								{isLoading ? 'Skickar...' : 'Skicka kod'}
							</Button>
						</form>
					) : (
						<form onSubmit={handleVerifyOtp} className="space-y-6">
							<div className="space-y-4">
								<Label>6-siffrig kod</Label>
								<div className="flex justify-center">
									<InputOTP
										maxLength={6}
										value={code}
										onChange={handleCodeChange}
										onComplete={handleCodeComplete}
										autoFocus
									>
										<InputOTPGroup>
											<InputOTPSlot index={0} />
											<InputOTPSlot index={1} />
											<InputOTPSlot index={2} />
											<InputOTPSlot index={3} />
											<InputOTPSlot index={4} />
											<InputOTPSlot index={5} />
										</InputOTPGroup>
									</InputOTP>
								</div>
							</div>
							{error && (
								<p className="text-sm text-destructive text-center">{error}</p>
							)}
							<Button
								type="submit"
								className="w-full"
								disabled={isLoading || code.length !== 6}
							>
								{isLoading ? 'Verifierar...' : 'Verifiera'}
							</Button>
							<Button
								type="button"
								variant="ghost"
								className="w-full"
								onClick={() => {
									setStep('email')
									setCode('')
									setError('')
								}}
							>
								Tillbaka
							</Button>
						</form>
					)}
				</CardContent>
			</Card>
			<footer className="mt-8 w-full max-w-md text-center text-sm text-muted-foreground space-y-1">
				<p>
					Tidrapportering - Ett verktyg för enkel och effektiv tidsredovisning.
				</p>
				<p>Vid frågor eller support, kontakta din administratör.</p>
			</footer>
		</div>
	)
}
