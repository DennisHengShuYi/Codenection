import { useState, type FormEvent } from 'react'
import { readDataConfig, register, signIn, signInWithGoogle, type Session } from '../../data'
import { Button } from '../kit/Button'
import { Field } from '../kit/Field'
import { GoogleMark } from './GoogleMark'

export function SignInScreen({
  onSignedIn,
  onSkip,
}: {
  onSignedIn: (session: Session) => void
  onSkip: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A build with no Supabase runs entirely on browser storage, so there is nothing to sign
  // in with. Offering the button there would be a door that cannot open.
  const canUseGoogle = readDataConfig().supabaseUrl !== null

  async function onGoogle() {
    if (busy) return

    setBusy(true)
    setError(null)

    const result = await signInWithGoogle()

    // Deliberately no `finally`. On success the browser is on its way to Google's consent
    // page, and releasing the form would let a student start a second sign-in into a
    // screen that is already navigating away. Only a failure gives the form back.
    if (!result.ok) {
      setError(result.message)
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()

    // An accidental tap on an empty form costs nothing rather than producing an error.
    if (email === '' || password === '' || busy) return

    setBusy(true)
    setError(null)

    try {
      const result = await (creating ? register(email, password) : signIn(email, password))

      if (result.ok) onSignedIn(result.session)
      else setError(result.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Codenection</h1>
        <p className="text-sm text-ink-soft">
          {creating
            ? 'Create an account and your week is kept, on any device.'
            : 'Sign in to pick up where you left off.'}
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-line px-3 py-2"
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-line px-3 py-2"
          />
        </Field>

        {/* role=alert so assistive technology is told what went wrong, rather than the
            message appearing for sighted users only. */}
        {error !== null && (
          <p role="alert" className="text-sm text-attention">
            {error}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {creating ? 'Create account' : 'Sign in'}
        </Button>
      </form>

      {canUseGoogle && (
        <div className="flex flex-col gap-3">
          {/* aria-hidden: the divider is a visual separator, and "or" read aloud between
              two buttons tells a screen reader user nothing they cannot already tell. */}
          <div aria-hidden="true" className="flex items-center gap-3 text-xs opacity-60">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button
            variant="secondary"
            onClick={() => void onGoogle()}
            disabled={busy}
            className="w-full justify-center gap-3"
          >
            <GoogleMark />
            Continue with Google
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm">
        <Button variant="quiet" size="sm" onClick={() => setCreating(!creating)} className="self-start">
          {creating ? 'I already have an account' : 'Create an account'}
        </Button>

        {/* §0: no cold start, and no login wall between a judge and a working demo. */}
        <Button variant="quiet" size="sm" onClick={onSkip} className="self-start">
          Look around without an account
        </Button>
      </div>
    </main>
  )
}
