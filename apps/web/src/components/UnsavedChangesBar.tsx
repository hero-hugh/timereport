import * as React from 'react'
import { cn } from '../lib/utils'
import { Button } from './ui/button'

export interface UnsavedChangesBarProps {
	visible: boolean
	onCancel: () => void
	onSave: () => void
	isSaving: boolean
}

const UnsavedChangesBar = React.forwardRef<
	HTMLDivElement,
	UnsavedChangesBarProps
>(({ visible, onCancel, onSave, isSaving }, ref) => {
	return (
		<div
			ref={ref}
			className={cn(
				'fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-out',
				visible ? 'translate-y-0' : 'translate-y-full',
			)}
		>
			{/* Desktop (≥768px): Fixed bottom bar */}
			<div className="hidden md:block border-t-2 border-amber-300 bg-amber-50/95 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] backdrop-blur-sm">
				<div className="mx-auto flex max-w-7xl items-center justify-between p-4">
					<p className="text-sm font-medium text-amber-800">
						Du har osparade ändringar - ändringar måste sparas
					</p>
					<div className="flex items-center gap-3">
						<Button variant="outline" onClick={onCancel} disabled={isSaving}>
							Avbryt
						</Button>
						<Button onClick={onSave} disabled={isSaving}>
							{isSaving ? 'Sparar...' : 'Spara'}
						</Button>
					</div>
				</div>
			</div>

			{/* Mobile (<768px): Overlay style */}
			<div className="md:hidden border-t-2 border-amber-300 bg-amber-50/95 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] backdrop-blur-sm">
				<div className="flex flex-col items-center gap-3 p-4">
					<p className="text-sm font-medium text-amber-800 text-center">
						Du har osparade ändringar - ändringar måste sparas
					</p>
					<div className="flex w-full items-center gap-3">
						<Button
							variant="outline"
							className="min-h-[44px] flex-1"
							onClick={onCancel}
							disabled={isSaving}
						>
							Avbryt
						</Button>
						<Button
							className="min-h-[44px] flex-1"
							onClick={onSave}
							disabled={isSaving}
						>
							{isSaving ? 'Sparar...' : 'Spara'}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
})
UnsavedChangesBar.displayName = 'UnsavedChangesBar'

export { UnsavedChangesBar }
