import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx is the composition root: three lines of wiring with nothing to assert
      // that the browser test does not already cover. test-setup.ts is the harness.
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/main.tsx', 'src/test-setup.ts'],
    },
  },
})
