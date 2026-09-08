import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Whether the student's system has asked for less movement.
 *
 * §1.5 requires that setting to leave the app fully functional, so what it gates is
 * skipped entirely rather than shortened — everything the animation would have shown is
 * simply shown in its final state.
 *
 * Guarded because `matchMedia` is missing in older browsers and in some test
 * environments, and assuming it exists would crash the app rather than degrade to full
 * motion.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined

    const query = matchMedia(QUERY)
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)

    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}
