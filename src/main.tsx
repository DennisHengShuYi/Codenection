import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
