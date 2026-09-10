import { useMemo, useState } from 'react'
import { createRepository, signOut, unlinkTelegram } from '../data'
import { SignInScreen } from './auth/SignInScreen'
import { useSession } from './auth/useSession'
import { Button } from './kit/Button'
import { RoomShell } from './room/RoomShell'
import { useBlockLog } from './useBlockLog'

export function App() {
  const { session, loading, setSession, signedIn } = useSession()
  const [browsing, setBrowsing] = useState(false)

  const repository = useMemo(() => createRepository(session), [session])
  // Ruling 12: `RoomShell.blockLog` is a required prop now, so something above it has to
  // load a real one -- this is that something, kept at the app's own top level next to
  // `repository` and `session` rather than inside the screen it feeds.
  const {
    blockLog,
    recordAnswer,
    problem: blockLogProblem,
    retry: retryBlockLog,
  } = useBlockLog(repository)

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

  // Ruling 49: the log could not be READ, which is not the same as nobody having answered.
  // Every number on the room screen -- the gauge, the weather, the dial, the lapsed
  // notice, the price of a request -- is projected from these answers and calibrated by
  // them, so there is no honest subset of that screen to keep showing. `/ask` makes the
  // same call on the other door (`handle.ts:264`): it refuses to price rather than quoting
  // a number computed from an assumption nobody made. Refusing here is that answer, said
  // in the same voice, so one student gets one answer whichever door they came through.
  if (blockLog === null) {
    return (
      <main className="mx-auto flex max-w-screen-md flex-col items-start gap-3 p-4">
        <p data-testid="block-log-problem" role="status" className="text-sm text-attention">
          {blockLogProblem}
        </p>
        <p className="text-sm text-ink-soft">
          Everything the room shows is worked out from those answers, so I would rather show
          you nothing than a number I made up.
        </p>
        <Button onClick={retryBlockLog}>Try again</Button>
      </main>
    )
  }

  return (
    /* One viewport-height column, not a bare fragment.
     *
     * The room stage below is the full height of the screen and the band inside it is
     * anchored to the stage's bottom edge. A sentence rendered above the stage in normal
     * flow would push the whole stage down: the band would land below the fold, taking `+`
     * -- the one control low-energy mode keeps -- with it, and the page would gain a
     * scrollbar in a state the student is already having a bad time in. Making the two
     * flex children of one `h-dvh` column takes the notice's height out of the stage
     * instead of out of the screen. Costs nothing when the notice is absent, which is
     * almost always: the stage is then the only child and fills the column exactly. */
    <div className="flex h-dvh flex-col">
      {/* Rendered here rather than inside `RoomShell` because this is where the hook that
          knows about it lives, and threading it down would mean a new required prop on all
          34 render sites for a sentence that appears when storage is broken. A block answer
          is a one-shot event and it is what §8's accuracy figure is scored against, so a
          write that vanishes has to be said out loud -- see `useBlockLog`. */}
      {blockLogProblem !== null && (
        <p
          data-testid="block-log-problem"
          role="status"
          className="mx-auto w-full max-w-screen-md shrink-0 px-4 pt-4 text-sm text-attention"
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
    </div>
  )
}
