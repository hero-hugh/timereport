import { type FormEvent, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

const NAME_REGEX = /^[\p{L}\s-]{2,50}$/u

function validateName(value: string): string | null {
	if (value.length < 2) return 'Måste vara minst 2 tecken'
	if (value.length > 50) return 'Får vara max 50 tecken'
	if (!NAME_REGEX.test(value))
		return 'Får bara innehålla bokstäver, mellanslag och bindestreck'
	return null
}

interface ProfileEditDialogProps {
	open: boolean
	onClose: () => void
	onSaved: () => void
	initialFirstName?: string | null
	initialLastName?: string | null
}

export function ProfileEditDialog({
	open,
	onClose,
	onSaved,
	initialFirstName,
	initialLastName,
}: ProfileEditDialogProps) {
	const [firstName, setFirstName] = useState(initialFirstName || '')
	const [lastName, setLastName] = useState(initialLastName || '')
	const [firstNameError, setFirstNameError] = useState<string | null>(null)
	const [lastNameError, setLastNameError] = useState<string | null>(null)
	const [saving, setSaving] = useState(false)
	const [apiError, setApiError] = useState<string | null>(null)

	useEffect(() => {
		if (open) {
			setFirstName(initialFirstName || '')
			setLastName(initialLastName || '')
			setFirstNameError(null)
			setLastNameError(null)
			setApiError(null)
		}
	}, [open, initialFirstName, initialLastName])

	if (!open) return null

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault()

		const fnError = validateName(firstName)
		const lnError = validateName(lastName)
		setFirstNameError(fnError)
		setLastNameError(lnError)

		if (fnError || lnError) return

		setSaving(true)
		setApiError(null)

		const result = await api.updateProfile({ firstName, lastName })

		setSaving(false)

		if (result.success) {
			onSaved()
			onClose()
		} else {
			setApiError(result.error || 'Kunde inte spara profilen')
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<div
				className="fixed inset-0 bg-black/50"
				onClick={onClose}
				onKeyDown={() => {}}
			/>
			<div className="relative z-10 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
				<h2 className="text-lg font-semibold mb-4">Redigera profil</h2>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="firstName">Förnamn</Label>
						<Input
							id="firstName"
							value={firstName}
							onChange={(e) => {
								setFirstName(e.target.value)
								setFirstNameError(null)
							}}
						/>
						{firstNameError && (
							<p className="text-sm text-destructive">{firstNameError}</p>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="lastName">Efternamn</Label>
						<Input
							id="lastName"
							value={lastName}
							onChange={(e) => {
								setLastName(e.target.value)
								setLastNameError(null)
							}}
						/>
						{lastNameError && (
							<p className="text-sm text-destructive">{lastNameError}</p>
						)}
					</div>
					{apiError && <p className="text-sm text-destructive">{apiError}</p>}
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							Avbryt
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Sparar...' : 'Spara'}
						</Button>
					</div>
				</form>
			</div>
		</div>
	)
}
