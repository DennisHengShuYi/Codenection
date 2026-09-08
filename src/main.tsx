import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerServiceWorker } from './pwa/registerServiceWorker'
import { App } from './ui/App'
import './styles.css'

// Throw rather than optional-chain into a no-op: a missing #root means the page shipped
// without its mount point, and a silent blank screen is the hardest version of that bug
// to diagnose.
const root = document.getElementById('root')
if (!root) throw new Error('#root missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// After the render, and deliberately not awaited: installability is a bonus, and the app
// must not wait on it to show a student their week.
void registerServiceWorker()
