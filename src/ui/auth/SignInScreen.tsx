import { useState, type FormEvent } from 'react'
import { register, signIn, type Session } from '../../data'

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
        <p className="text-sm opacity-70">
          {creating
            ? 'Create an account and your week is kept, on any device.'
            : 'Sign in to pick up where you left off.'}
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        {/* role=alert so assistive technology is told what went wrong, rather than the
            message appearing for sighted users only. */}
        {error !== null && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
        >
          {creating ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <div className="flex flex-col gap-2 text-sm">
        <button type="button" onClick={() => setCreating(!creating)} className="underline">
          {creating ? 'I already have an account' : 'Create an account'}
        </button>

        {/* §0: no cold start, and no login wall between a judge and a working demo. */}
        <button type="button" onClick={onSkip} className="underline opacity-70">
          Look around without an account
        </button>
      </div>
    </main>
  )
}
