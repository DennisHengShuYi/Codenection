import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { globSync } from 'node:fs'

/**
 * §12: no component outside `kit/` writes a colour utility.
 *
 * Before this existed the app used nine colour families across seventeen background
 * utilities, and the primary button was hand-written eighteen times. Nothing stopped that
 * happening and nothing would stop it happening again -- a design system with no guard is
 * a convention, and conventions lose to whichever session is in a hurry.
 *
 * Matches both `family-number` utilities (`bg-slate-500`) and the bare/opacity-suffixed
 * forms a `family-number` pattern alone would miss (`text-white`, `bg-transparent`,
 * `bg-black/50`).
 */
const TAILWIND_COLOUR =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|stone|gray|zinc|neutral|amber|yellow|orange|red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime)-\d{2,3}(?:\/\d{1,3})?\b|\b(?:bg|text|border|ring|fill|stroke)-(?:white|black|transparent)(?:\/\d{1,3})?\b/

/** True when `kit` is a whole path segment, not a substring -- a directory named
 *  `toolkit`, or a file named `kitchen.tsx`, must not be exempted by accident. */
const isInKit = (path: string): boolean => path.split(/[/\\]/).includes('kit')

describe('palette discipline', () => {
  it('keeps colour utilities inside src/ui/kit', () => {
    const offenders = [...globSync('src/ui/**/*.tsx'), ...globSync('src/ui/**/*.ts')]
      .filter((path) => !isInKit(path) && !path.endsWith('.test.tsx') && !path.endsWith('.test.ts'))
      // The room drawing is an illustration, not chrome: its SVG fills encode §1.3's nine
      // bindings and are the one place a literal colour is the meaning.
      .filter((path) => !path.endsWith('Room.tsx') && !path.endsWith('Character.tsx'))
      .filter((path) => TAILWIND_COLOUR.test(readFileSync(path, 'utf8')))

    expect(offenders).toEqual([])
  })
})
