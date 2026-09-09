import { useRef } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from './useSession'

const listeners: Array<(session: unknown) => void> = []
let stored: unknown = null

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSession: () => Promise.resolve(stored),
  onSessionChange: (listener: (session: unknown) => void) => {
    listeners.push(listener)
    return () => undefined
  },
  createLocalRepository: () => ({ kind: 'local' }),
  createRepository: (session: unknown) => ({ kind: 'account', session }),
}))

const carryOverWeek = vi.fn()
vi.mock('../../data/carryOver', () => ({
  carryOverWeek: (from: unknown, to: unknown) => {
    carryOverWeek(from, to)
    return Promise.resolve()
  },
}))

const scrub = vi.fn()
vi.mock('./scrubAuthFragment', () => ({
  scrubAuthFragmentFromUrl: () => scrub(),
}))

function Probe() {
  const { session, loading } = useSession()

  if (loading) return <p>looking</p>
  return <p data-testid="who">{session ? session.email : 'nobody'}</p>
}

const signedInElsewhere = (session: unknown) => listeners.forEach((notify) => notify(session))

beforeEach(() => {
  listeners.length = 0
  stored = null
  carryOverWeek.mockReset()
  scrub.mockReset()
})

describe('useSession', () => {
  it('reports nobody signed in once it has looked', async () => {
    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))
  })

  /**
   * Without this, the app renders the signed-out preview for a frame before the stored
   * session resolves -- so a signed-in student sees a flash of "you are not signed in" on
   * every single load.
   */
  it('reports that it is still looking before the answer arrives', () => {
    render(<Probe />)

    expect(screen.getByText('looking')).toBeVisible()
  })

  // Signing out in one tab must not leave another holding a stale session.
  it('follows a sign-in that happened in another tab', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    signedInElsewhere({ userId: 'u1', email: 'a@b.com' })

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('a@b.com'))
  })
})

/**
 * Coming back from Google. The redirect bypasses the sign-in screen entirely, so anything
 * that used to happen in that screen's callback has to happen here instead or it does not
 * happen at all.
 */
describe('useSession, when a session arrives by redirect', () => {
  it('cleans the token out of the address', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    signedInElsewhere({ userId: 'u1', email: 'a@b.com' })

    await waitFor(() => expect(scrub).toHaveBeenCalled())
  })

  // Without this a student who built a week while looking around, then signed in with
  // Google, would silently lose it -- the redirect never touches the screen that copies it.
  it('carries the preview week into the account', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    signedInElsewhere({ userId: 'u1', email: 'a@b.com' })

    await waitFor(() => expect(carryOverWeek).toHaveBeenCalledOnce())
    expect(carryOverWeek.mock.calls[0]?.[0]).toEqual({ kind: 'local' })
  })

  // Supabase reports the same session more than once in normal operation. Copying twice
  // would put a preview over real data the second time.
  it('does not carry the week over twice for the same account', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    signedInElsewhere({ userId: 'u1', email: 'a@b.com' })
    await waitFor(() => expect(carryOverWeek).toHaveBeenCalledOnce())
    signedInElsewhere({ userId: 'u1', email: 'a@b.com' })

    expect(carryOverWeek).toHaveBeenCalledOnce()
  })

  /**
   * A session that was already there when the app opened is somebody returning, not
   * somebody signing in. Copying then would overwrite the account's real week with
   * whatever happened to be in browser storage, on every single load.
   */
  it('does not carry anything over for a session restored on opening', async () => {
    stored = { userId: 'u1', email: 'a@b.com' }
    render(<Probe />)

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('a@b.com'))

    expect(carryOverWeek).not.toHaveBeenCalled()
    expect(scrub).not.toHaveBeenCalled()
  })

  it('does nothing on a sign-out', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    signedInElsewhere(null)

    expect(carryOverWeek).not.toHaveBeenCalled()
    expect(scrub).not.toHaveBeenCalled()
  })

  // Signing out and back in as somebody else is a real sign-in, and their preview belongs
  // to them.
  it('carries over again for a different account', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('nobody'))

    signedInElsewhere({ userId: 'u1', email: 'a@b.com' })
    await waitFor(() => expect(carryOverWeek).toHaveBeenCalledOnce())
    signedInElsewhere({ userId: 'u2', email: 'c@d.com' })

    await waitFor(() => expect(carryOverWeek).toHaveBeenCalledTimes(2))
  })
})

/**
 * Session identity, which is load-bearing well outside this hook.
 *
 * App builds the repository in a `useMemo` keyed on the session, so a new session *object*
 * -- even one describing exactly the same account -- rebuilds the repository and reloads
 * the week. Supabase announces the same session repeatedly in normal operation (token
 * refreshes, a second tab, a client being constructed), so handing a fresh object to React
 * each time is what turns routine chatter into a render loop.
 */
describe('useSession, when the same account is announced again', () => {
  function IdentityProbe() {
    const { session, loading } = useSession()
    const seen = useRef(new Set<unknown>())

    if (session !== null) seen.current.add(session)
    if (loading) return <p>looking</p>

    return <p data-testid="identities">{seen.current.size}</p>
  }

  it('keeps the same session object rather than replacing it', async () => {
    render(<IdentityProbe />)
    await waitFor(() => expect(screen.getByTestId('identities')).toBeVisible())

    // act, not waitFor: waitFor passes the moment the condition already holds, so it would
    // report success before React had even processed the second announcement -- proving
    // nothing. act flushes it, so the assertion sees the settled result.
    await act(async () => signedInElsewhere({ userId: 'u1', email: 'a@b.com' }))
    expect(screen.getByTestId('identities')).toHaveTextContent('1')

    // The same account, reported again as a brand-new object -- exactly what Supabase does.
    await act(async () => signedInElsewhere({ userId: 'u1', email: 'a@b.com' }))

    expect(screen.getByTestId('identities')).toHaveTextContent('1')
  })

  it('does replace it when something about the account actually changed', async () => {
    render(<IdentityProbe />)
    await waitFor(() => expect(screen.getByTestId('identities')).toBeVisible())

    await act(async () => signedInElsewhere({ userId: 'u1', email: 'a@b.com' }))
    expect(screen.getByTestId('identities')).toHaveTextContent('1')

    await act(async () =>
      signedInElsewhere({ userId: 'u1', email: 'a@b.com', name: 'Ada Lovelace' }),
    )

    expect(screen.getByTestId('identities')).toHaveTextContent('2')
  })
})
