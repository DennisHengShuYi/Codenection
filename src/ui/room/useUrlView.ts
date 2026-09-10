import { useCallback, useEffect, useRef, useState } from 'react'
import { fromPath, isAscent, toPath, type View } from './view'

/**
 * `View`, kept in the address bar.
 *
 * Returns exactly what `useState<View>` returned before it, so the screen that navigates
 * is unchanged: the URL is a projection of the view, never a second place the app stores
 * where it is. Everything pure about that translation lives in `view.ts`; this owns the
 * three impure things -- reading `location`, writing `history`, and listening for the Back
 * button.
 *
 * Guarded on `window` because `view.ts` is imported by code with no DOM. Without a window
 * there is no address to read, and the room is the honest answer rather than a crash.
 */
const currentPath = (): string =>
  typeof window === 'undefined' ? '/' : window.location.pathname

export function useUrlView(): readonly [View, (next: View) => void] {
  const [view, setViewState] = useState<View>(() => fromPath(currentPath()))

  /**
   * Where we are, readable synchronously.
   *
   * `setView` has to know what it is moving FROM to decide between push and replace, and
   * it cannot ask React: two calls in one tick would both see the pre-render value, and
   * the same decision inside a state updater would run twice under StrictMode -- pushing
   * two entries for one navigation, so one Back press would appear to do nothing.
   */
  const here = useRef(view)

  // An address the app cannot read resolved to the room; the bar has to be corrected or it
  // goes on asserting a state the app is not in. Replaced, not pushed: a typo should not
  // become an entry you can press Back into.
  useEffect(() => {
    if (typeof window === 'undefined') return

    const corrected = toPath(fromPath(window.location.pathname))
    if (corrected !== window.location.pathname) {
      window.history.replaceState(null, '', corrected)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onPop = () => {
      const next = fromPath(window.location.pathname)
      here.current = next
      setViewState(next)
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setView = useCallback((next: View) => {
    const path = toPath(next)

    // Only when the address would actually change. Re-selecting where you already are is
    // not a navigation, and an entry for it would be a Back press that does nothing.
    if (typeof window !== 'undefined' && path !== window.location.pathname) {
      const write = isAscent(here.current, next)
        ? window.history.replaceState.bind(window.history)
        : window.history.pushState.bind(window.history)

      write(null, '', path)
    }

    here.current = next
    setViewState(next)
  }, [])

  return [view, setView] as const
}
