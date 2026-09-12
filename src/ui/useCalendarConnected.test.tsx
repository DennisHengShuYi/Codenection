import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCalendarConnected } from './useCalendarConnected'

/**
 * Whether this student has a calendar connected, where the add flow can see it.
 *
 * `CalendarConnection` in settings has asked this since the feature shipped, and the import
 * screen -- the one place a student actually connects from -- never did: `RoomShell` passed
 * no `calendarConnected`, so `AddSheet`'s default of `false` stood for everybody, always. The
 * screen offered "Connect Google Calendar" to a student who had already connected, and never
 * offered "Read my calendar" to anybody, which is why nothing was ever imported.
 *
 * Answers false while it is still asking, and false when it cannot tell. That is the same
 * choice `hasCalendarConnected` makes one layer down and for the same reason: showing the
 * connect step to somebody already connected costs them one redirect that lands right back
 * here, where claiming a connection that is not there offers a Read button that fails.
 */
const asking = vi.hoisted(() => ({ answer: vi.fn<() => Promise<boolean>>() }))

vi.mock('../google/connection', () => ({ hasCalendarConnected: asking.answer }))

afterEach(() => {
  vi.clearAllMocks()
})

describe('useCalendarConnected', () => {
  it('says no while it is still asking', () => {
    asking.answer.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCalendarConnected(true))

    expect(result.current.connected).toBe(false)
  })

  it('says yes once the database answers', async () => {
    asking.answer.mockResolvedValue(true)

    const { result } = renderHook(() => useCalendarConnected(true))

    await waitFor(() => expect(result.current.connected).toBe(true))
  })

  it('says no when the database says no', async () => {
    asking.answer.mockResolvedValue(false)

    const { result } = renderHook(() => useCalendarConnected(true))

    await waitFor(() => expect(asking.answer).toHaveBeenCalled())
    expect(result.current.connected).toBe(false)
  })

  /** A grant belongs to an account. Asking on behalf of a signed-out visitor is a round trip
   *  that can only answer no, and `getClient` would be asked for a session that is not there. */
  it('does not ask at all when nobody is signed in', () => {
    const { result } = renderHook(() => useCalendarConnected(false))

    expect(asking.answer).not.toHaveBeenCalled()
    expect(result.current.connected).toBe(false)
  })

  it('asks again when somebody signs in', async () => {
    asking.answer.mockResolvedValue(true)

    const { result, rerender } = renderHook(({ signedIn }) => useCalendarConnected(signedIn), {
      initialProps: { signedIn: false },
    })

    expect(asking.answer).not.toHaveBeenCalled()

    rerender({ signedIn: true })

    await waitFor(() => expect(result.current.connected).toBe(true))
  })

  /** Disconnecting happens on another screen entirely, so the add flow has to be able to ask
   *  again rather than holding whatever was true when the room mounted. */
  it('can be asked again on demand', async () => {
    asking.answer.mockResolvedValue(false)

    const { result } = renderHook(() => useCalendarConnected(true))
    await waitFor(() => expect(asking.answer).toHaveBeenCalledTimes(1))

    asking.answer.mockResolvedValue(true)
    result.current.refresh()

    await waitFor(() => expect(result.current.connected).toBe(true))
  })

  /** A late answer landing on an unmounted room is a React warning and a write to state
   *  nothing is watching. */
  it('drops an answer that arrives after it is gone', async () => {
    let settle: (value: boolean) => void = () => undefined
    asking.answer.mockReturnValue(new Promise<boolean>((resolve) => (settle = resolve)))

    const { unmount } = renderHook(() => useCalendarConnected(true))
    unmount()

    settle(true)

    await waitFor(() => expect(asking.answer).toHaveBeenCalled())
  })
})
