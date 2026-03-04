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
				'fixed bottom-4 left-0 right-0 z-50 flex justify-center pointer-events-none transition-all duration-300 ease-out',
				'px-4',
				visible
					? 'translate-y-0 opacity-100'
					: 'translate-y-full opacity-0',
			)}
		>
			<div
				className={cn(
					'pointer-events-auto flex items-center gap-4 rounded-2xl bg-white px-5 py-3 shadow-lg ring-1 ring-black/5',
					'max-w-2xl w-full md:w-auto',
				)}
			>
				{/* Warning icon */}
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
						<path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
					</svg>
				</span>

				{/* Text */}
				<p className="flex-1 text-sm text-gray-600 min-w-0">
					<span className="font-bold text-gray-800">
						Du har osparade ändringar
					</span>
					<span className="hidden sm:inline">
						{' '}
						&mdash; ändringar måste sparas
					</span>
				</p>

				{/* Buttons */}
				<div className="flex shrink-0 items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="rounded-lg border-gray-200 bg-white px-4 text-gray-700 hover:bg-gray-50"
						onClick={onCancel}
						disabled={isSaving}
					>
						Avbryt
					</Button>
					<Button
						size="sm"
						className="rounded-lg bg-indigo-500 px-5 text-white hover:bg-indigo-600"
						onClick={onSave}
						disabled={isSaving}
					>
						{isSaving ? 'Sparar...' : 'Spara'}
					</Button>
				</div>
			</div>
		</div>
	)
})
UnsavedChangesBar.displayName = 'UnsavedChangesBar'

export { UnsavedChangesBar }
