import { useMemo, useState } from 'react'
import { createRepository, signOut, unlinkTelegram } from '../data'
import { SignInScreen } from './auth/SignInScreen'
import { useSession } from './auth/useSession'
import { RoomShell } from './room/RoomShell'
import { useBlockLog } from './useBlockLog'

export function App() {
  const { session, loading, setSession, signedIn } = useSession()
  const [browsing, setBrowsing] = useState(false)

  const repository = useMemo(() => createRepository(session), [session])
  // Ruling 12: `RoomShell.blockLog` is a required prop now, so something above it has to
  // load a real one -- this is that something, kept at the app's own top level next to
  // `repository` and `session` rather than inside the screen it feeds.
  const { blockLog, recordAnswer, problem: blockLogProblem } = useBlockLog(repository)

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
    <>
      {/* Rendered here rather than inside `RoomShell` because this is where the hook that
          knows about it lives, and threading it down would mean a new required prop on all
          34 render sites for a sentence that appears when storage is broken. A block answer
          is a one-shot event and it is what §8's accuracy figure is scored against, so a
          write that vanishes has to be said out loud -- see `useBlockLog`. */}
      {blockLogProblem !== null && (
        <p
          data-testid="block-log-problem"
          role="status"
          className="mx-auto max-w-screen-md px-4 pt-4 text-sm text-attention"
        >
          {blockLogProblem}
        </p>
      )}
      <RoomShell
        repository={repository}
        session={session}
        blockLog={blockLog}
        onAnswerBlock={recordAnswer}
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
    </>
  )
}
