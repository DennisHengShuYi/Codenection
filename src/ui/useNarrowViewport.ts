import { useEffect, useState } from 'react'

/**
 * Tailwind's `sm` breakpoint, from the other side.
 *
 * Stated here rather than inferred so the one place that reads it and the utility classes
 * elsewhere cannot drift: `sm:` applies from 640px up, so narrow is everything below it.
 */
const QUERY = '(max-width: 639px)'

/**
 * Whether this is a phone-width screen.
 *
 * A media query in JavaScript rather than a CSS class because the thing it decides is an SVG
 * `viewBox` — an attribute, not a style, and there is no CSS that can set one. The room is
 * framed more tightly on a phone (see `Room.tsx`), and framing is exactly the kind of
 * decision that cannot be expressed as a utility class.
 *
 * Guarded because `matchMedia` is missing in some test environments, and assuming it exists
 * would crash the app rather than degrade to the wide framing — which is the safe default,
 * since it is the one that crops nothing.
 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined

    const query = matchMedia(QUERY)
    setNarrow(query.matches)

    const onChange = (event: MediaQueryListEvent) => setNarrow(event.matches)
    query.addEventListener('change', onChange)

    return () => query.removeEventListener('change', onChange)
  }, [])

  return narrow
}
