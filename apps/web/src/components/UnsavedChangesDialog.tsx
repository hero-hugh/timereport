import * as React from 'react'
import { useEffect, useRef } from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

export interface UnsavedChangesDialogProps {
	open: boolean
	onDiscard: () => void
	onCancel: () => void
}

export function UnsavedChangesDialog({
	open,
	onDiscard,
	onCancel,
}: UnsavedChangesDialogProps) {
	const cancelRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (open) {
			cancelRef.current?.focus()
		}
	}, [open])

	useEffect(() => {
		if (!open) return
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onCancel()
			}
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [open, onCancel])

	if (!open) return null

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/40 backdrop-blur-sm"
				onClick={onCancel}
			/>

			{/* Dialog */}
			<div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="unsaved-dialog-title"
				aria-describedby="unsaved-dialog-desc"
				className={cn(
					'relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl',
					'mx-4 animate-in fade-in zoom-in-95 duration-200',
				)}
			>
				<h2
					id="unsaved-dialog-title"
					className="text-lg font-semibold text-gray-900"
				>
					Osparade ändringar
				</h2>
				<p
					id="unsaved-dialog-desc"
					className="mt-2 text-sm text-gray-600"
				>
					Du har osparade ändringar. Vill du lämna sidan utan att
					spara?
				</p>

				<div className="mt-6 flex justify-end gap-3">
					<Button
						ref={cancelRef}
						variant="outline"
						size="sm"
						className="rounded-lg border-gray-200 px-4"
						onClick={onCancel}
					>
						Stanna kvar
					</Button>
					<Button
						variant="destructive"
						size="sm"
						className="rounded-lg px-4"
						onClick={onDiscard}
					>
						Lämna utan att spara
					</Button>
				</div>
			</div>
		</div>
	)
}
