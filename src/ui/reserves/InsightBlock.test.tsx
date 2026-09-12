import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InsightBlock } from './InsightBlock'

/**
 * The block that says what the sheet's numbers mean, under the numbers themselves.
 *
 * §1.5's text equivalent directly above is a restatement by design -- it is the dial for a
 * screen reader, so interpretation folded into it would be indistinguishable from a
 * reading. This is kept apart for that reason, and it renders the computed wording first
 * and always: the facts are true before any model is asked, so there is nothing to spin on.
 */
const COMPUTED = ['People is your thinnest, at 43.', 'Nothing takes you below 30.']

const ok = (payload: unknown) => ({ ok: true, json: async () => payload }) as unknown as Response

const status = (code: number) => ({ ok: false, status: code }) as unknown as Response

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('InsightBlock', () => {
  it('shows the computed reading immediately, without waiting on anything', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}) as Promise<Response>)

    render(<InsightBlock lines={COMPUTED} />)

    expect(screen.getByText(COMPUTED[0] as string)).toBeVisible()
  })

  it('swaps in the model wording once it arrives', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ lines: ['Warmer one.', 'Warmer two.'] }))

    render(<InsightBlock lines={COMPUTED} />)

    await waitFor(() => expect(screen.getByText('Warmer one.')).toBeVisible())
    expect(screen.queryByText(COMPUTED[0] as string)).toBeNull()
  })

  /** No key configured, which is CI, the tests and `vite dev` where /api is not served. The
   *  student still gets the whole reading -- the fallback is an equal, not an apology. */
  it('keeps the computed reading when there is no model to ask', async () => {
    vi.mocked(fetch).mockResolvedValue(status(503))

    render(<InsightBlock lines={COMPUTED} />)

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(screen.getByText(COMPUTED[1] as string)).toBeVisible()
  })

  it('draws nothing at all rather than an empty heading', () => {
    render(<InsightBlock lines={[]} />)

    expect(screen.queryByTestId('reserve-insight')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  /** A caller rebuilding the same lines each render must not re-ask the model each render:
   *  this sheet re-renders whenever anything behind it moves, and the endpoint is public
   *  and unmetered. */
  it('asks once for one set of lines, however often it re-renders', async () => {
    vi.mocked(fetch).mockResolvedValue(ok({ lines: ['a', 'b'] }))

    const { rerender } = render(<InsightBlock lines={COMPUTED} />)
    rerender(<InsightBlock lines={[...COMPUTED]} />)
    rerender(<InsightBlock lines={[...COMPUTED]} />)

    await waitFor(() => expect(screen.getByText('a')).toBeVisible())
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1)
  })
})
