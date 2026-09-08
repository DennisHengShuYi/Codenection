import { useMemo, useState } from 'react'
import { createRepository, signOut } from '../data'
import { SignInScreen } from './auth/SignInScreen'
import { useSession } from './auth/useSession'
import { HomeScreen } from './HomeScreen'

export function App() {
  const { session, loading, setSession, signedIn } = useSession()
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
        // Handed to the session hook rather than carrying the preview across here.
        // A Google sign-in comes back through a redirect that never touches this screen,
        // so anything done in this callback would simply not happen for it -- and the hook
        // is the one place every sign-in passes through, whichever door it used. It also
        // means the copy happens once: Supabase announces the sign-in a moment later, and
        // doing it in both places would put a preview over real data on the second pass.
        onSignedIn={signedIn}
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
