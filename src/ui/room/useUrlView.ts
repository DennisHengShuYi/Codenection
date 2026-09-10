import { useCallback, useEffect, useRef, useState } from 'react'
import { back, fromPath, isAscent, toPath, type View } from './view'

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

export function useUrlView(): readonly [View, (next: View) => void, () => void] {
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

  /**
   * How many entries THIS session put in the history.
   *
   * `goBack` needs it. A student who followed a pasted `/add/photo` has nothing of ours
   * behind them, so `history.back()` would take them out of the app entirely -- to
   * whatever page they were on before, or to a blank tab -- when all they asked for was
   * one level up. Counted rather than guessed: `history.length` includes entries from
   * before the app loaded and cannot tell ours apart from theirs.
   */
  const pushed = useRef(0)

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
      pushed.current = Math.max(0, pushed.current - 1)
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
      if (isAscent(here.current, next)) {
        window.history.replaceState(null, '', path)
      } else {
        window.history.pushState(null, '', path)
        pushed.current += 1
      }
    }

    here.current = next
    setViewState(next)
  }, [])

  /**
   * Up one level (Ruling 60).
   *
   * Walks the browser's own history where this session has an entry to walk back to, so
   * pressing Back in a sheet is indistinguishable from pressing the browser's Back and the
   * forward entry is not orphaned. Where it does not -- a pasted link, or an entry budget
   * already spent -- it navigates to the parent view instead, which `setView` will REPLACE
   * rather than push, because a parent is always an ascent.
   */
  const goBack = useCallback(() => {
    if (typeof window !== 'undefined' && pushed.current > 0) {
      window.history.back()
      return
    }

    setView(back(here.current))
  }, [setView])

  return [view, setView, goBack] as const
}
