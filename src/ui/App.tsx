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
          //
          // The target is a fallback repository, so its read can answer from browser
          // storage -- the very place the preview lives. That is benign in every case:
          // with Supabase reachable and the account new it reads null and the carry-over
          // runs, which is the case that matters; with Supabase unreachable, or not
          // configured at all, it reads the preview back and skips, and the week is
          // already exactly where it would have been copied to.
          //
          // Not awaited before the session changes: a slow copy must not hold somebody
          // on the sign-in screen after they have successfully signed in.
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
