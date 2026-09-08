import { useCallback, useEffect, useRef, useState } from 'react'

/** One sequence, short enough not to delay the report that follows it. */
const TIDY_UP_MS = 900

/**
 * §1.3's one tidy-up sequence, played when a rebalance is applied — the visible payoff
 * for a change the student just agreed to.
 *
 * Skipped entirely when reduced motion is asked for. §1.5 requires that setting to leave
 * the app fully functional, so the sequence does not play at all and everything it would
 * have shown is simply shown in its final state.
 */
export function useTidyUp(reducedMotion: boolean): { tidying: boolean; play: () => void } {
  const [tidying, setTidying] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const play = useCallback(() => {
    if (reducedMotion) return

    setTidying(true)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => setTidying(false), TIDY_UP_MS)
  }, [reducedMotion])

  // Cleared on unmount so a sequence in flight cannot set state on a component that has
  // gone -- which surfaces in tests as a warning that looks like a real failure.
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  return { tidying, play }
}
