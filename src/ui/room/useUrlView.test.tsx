import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROOM, toAdd, toBlock, toSettings, toWeek } from './view'
import { useUrlView } from './useUrlView'

/**
 * The impure half of the router: `history`, `popstate`, and a live `window`.
 *
 * jsdom hands every test in a file the SAME `history`, so a test that navigates leaves the
 * next one starting somewhere it did not choose. That is not a hypothetical -- it is the
 * ordinary way a suite like this goes quietly wrong -- so the address is reset here before
 * each test rather than after, which also covers a test that fails part-way through.
 */
const startAt = (path: string) => window.history.replaceState(null, '', path)

beforeEach(() => startAt('/'))
afterEach(() => vi.restoreAllMocks())

describe('the view, kept in the address', () => {
  it('starts wherever the address already points, so a pasted link opens that state', () => {
    startAt('/add/photo')

    const { result } = renderHook(() => useUrlView())

    expect(result.current[0]).toEqual(toAdd('photo'))
  })

  it('starts in the room when the address is the root', () => {
    const { result } = renderHook(() => useUrlView())

    expect(result.current[0]).toEqual(ROOM)
  })

  /**
   * An address the app cannot read resolves to the room -- and the bar has to be corrected
   * to match, or it goes on asserting a state the app is not in. Replaced rather than
   * pushed: a typo should not become an entry you can press Back into.
   */
  it('corrects an address it cannot read, without leaving it in the history', () => {
    startAt('/nowhere')
    const push = vi.spyOn(window.history, 'pushState')

    const { result } = renderHook(() => useUrlView())

    expect(result.current[0]).toEqual(ROOM)
    expect(window.location.pathname).toBe('/')
    expect(push).not.toHaveBeenCalled()
  })

  it('writes the address when the view changes', () => {
    const { result } = renderHook(() => useUrlView())

    act(() => result.current[1](toSettings()))

    expect(result.current[0]).toEqual(toSettings())
    expect(window.location.pathname).toBe('/settings')
  })

  /**
   * Descending pushes, which is what makes Back a step DOWN one level rather than a way
   * out of the app.
   */
  it('pushes an entry when opening something', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => useUrlView())

    act(() => result.current[1](toAdd()))
    act(() => result.current[1](toAdd('type')))

    expect(push).toHaveBeenCalledTimes(2)
    expect(window.location.pathname).toBe('/add/type')
  })

  /**
   * Ascending replaces. If Cancel pushed, Back from the chooser would walk the student
   * FORWARD into the flow they had just cancelled.
   */
  it('replaces rather than pushes when stepping back out of a sub-flow', () => {
    startAt('/add/type')
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useUrlView())

    act(() => result.current[1](toAdd()))

    expect(window.location.pathname).toBe('/add')
    expect(replace).toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('replaces when closing a block back to the week it was opened from', () => {
    startAt('/week/block/essay')
    const push = vi.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => useUrlView())

    expect(result.current[0]).toEqual(toBlock('essay'))

    act(() => result.current[1](toWeek()))

    expect(window.location.pathname).toBe('/week')
    expect(push).not.toHaveBeenCalled()
  })

  it('touches the history at all only when the address would actually change', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useUrlView())

    act(() => result.current[1](ROOM))

    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  /**
   * The Back button itself. The event is dispatched directly rather than through
   * `history.back()`, which jsdom services asynchronously -- this asserts what the hook
   * does with the event, which is the part this code owns.
   */
  it('follows the Back button without pushing anything new', () => {
    startAt('/add')
    const { result } = renderHook(() => useUrlView())
    const push = vi.spyOn(window.history, 'pushState')

    act(() => {
      window.history.replaceState(null, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current[0]).toEqual(ROOM)
    expect(push).not.toHaveBeenCalled()
  })

  it('stops listening once it is gone, so a closed screen cannot still be navigating', () => {
    const { result, unmount } = renderHook(() => useUrlView())
    const before = result.current[0]

    unmount()

    act(() => {
      window.history.replaceState(null, '', '/settings')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })

    expect(result.current[0]).toBe(before)
  })
})

/**
 * Ruling 60's Back button, which is a different thing from `setView`: it walks the
 * browser's own history rather than navigating somewhere new, so pressing it is
 * indistinguishable from pressing the browser's Back.
 */
describe('going back', () => {
  it('walks the history when this session put an entry there', () => {
    const { result } = renderHook(() => useUrlView())
    act(() => result.current[1](toAdd()))
    act(() => result.current[1](toAdd('photo')))

    const back = vi.spyOn(window.history, 'back')

    act(() => result.current[2]())

    expect(back).toHaveBeenCalledOnce()
  })

  /**
   * The case a pasted link creates, and the reason this is not simply `history.back()`:
   * a student who opened `/add/photo` directly has no entry of ours behind them, so
   * walking the history would take them OUT of the app -- to whatever page they were on
   * before, or to a blank tab. They go up one level instead.
   */
  it('steps up one level instead of leaving the site, when nothing was pushed', () => {
    startAt('/add/photo')
    const { result } = renderHook(() => useUrlView())
    const back = vi.spyOn(window.history, 'back')

    act(() => result.current[2]())

    expect(back).not.toHaveBeenCalled()
    expect(result.current[0]).toEqual(toAdd())
    expect(window.location.pathname).toBe('/add')
  })

  it('stops walking the history once its own entries are used up', () => {
    startAt('/add/photo')
    const { result } = renderHook(() => useUrlView())

    // Up to the chooser, which replaced rather than pushed -- so there is still nothing of
    // ours behind us, and the next Back must not leave the site either.
    act(() => result.current[2]())
    const back = vi.spyOn(window.history, 'back')

    act(() => result.current[2]())

    expect(back).not.toHaveBeenCalled()
    expect(result.current[0]).toEqual(ROOM)
  })
})
