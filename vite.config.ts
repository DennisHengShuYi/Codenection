import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Not 3000, for the reason playwright.config.ts already gives: that port is the default
// for half the JavaScript ecosystem, so on a machine running any other project it is
// usually taken. Both dev and preview answer on the same port so the browser suite can
// point at one URL regardless of which one is serving.
const PORT = Number(process.env.PORT ?? 5180)

export default defineConfig({
  plugins: [react()],
  server: { port: PORT, host: '127.0.0.1' },
  preview: { port: PORT, host: '127.0.0.1' },
})
