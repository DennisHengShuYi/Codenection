import { useMemo, useState } from 'react'
import { createLocalRepository, createRepository, signOut } from '../data'
import { carryOverWeek } from '../data/carryOver'
import { SignInScreen } from './auth/SignInScreen'
import { useSession } from './auth/useSession'
import { HomeScreen } from './HomeScreen'

export function App() {
  const { session, loading, setSession } = useSession()
  const [browsing, setBrowsing] = useState(false)

  const repository = useMemo(() => createRepository(session), [session])

  if (loading) {
    // One frame, and a sentence rather than a spinner -- a spinner says nothing about
    // what is happening.
    return (
      <main className="mx-auto max-w-screen-md p-4">
        <p>Checking whether you are signed in…</p>
      </main>
    )
  }

  if (session === null && !browsing) {
    return (
      <SignInScreen
        onSignedIn={(next) => {
          // Carry the preview across before the screen changes, so a week built while
          // looking around is not lost to the order they happened to do things in.
          void carryOverWeek(createLocalRepository(), createRepository(next)).finally(() =>
            setSession(next),
          )
        }}
        onSkip={() => setBrowsing(true)}
      />
    )
  }

  return (
    <HomeScreen
      repository={repository}
      email={session?.email ?? null}
      onSignOut={() => {
        void signOut().finally(() => {
          setSession(null)
          setBrowsing(false)
        })
      }}
      onSignIn={() => setBrowsing(false)}
    />
  )
}
