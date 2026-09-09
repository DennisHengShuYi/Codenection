import { useMemo, useState } from 'react'
import { createRepository, signOut, unlinkTelegram } from '../data'
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
      session={session}
      onSignOut={() => {
        // The chat is unlinked first, while there is still a session to authorise it.
        // Afterwards there would be no identity for the database function to act on, and a
        // chat would stay able to read a week nobody is signed into -- which on a shared or
        // lost phone is the case the link was meant to be revocable for.
        //
        // Failing to unlink must not block the sign-out itself: being unable to tidy up
        // cannot trap somebody in an account they asked to leave.
        void unlinkTelegram()
          .catch(() => undefined)
          .then(() => signOut())
          .catch(() => undefined)
          .finally(() => {
            setSession(null)
            setBrowsing(false)
          })
      }}
      onSignIn={() => setBrowsing(false)}
    />
  )
}
