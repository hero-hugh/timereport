import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
	'apps/api/vitest.config.ts',
	'apps/web/vite.config.ts',
])
