import { useMemo } from 'react'
import { createRepository } from '../data'
import { HomeScreen } from './HomeScreen'

export function App() {
  // Built once. Choosing the store is a startup decision, and rebuilding it on every
  // render would open a fresh Supabase client each time.
  const repository = useMemo(() => createRepository(), [])

  return <HomeScreen repository={repository} />
}
