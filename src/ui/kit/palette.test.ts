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
 */
const TAILWIND_COLOUR =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|stone|gray|zinc|neutral|amber|yellow|orange|red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime)-\d{2,3}\b/

describe('palette discipline', () => {
  it('keeps colour utilities inside src/ui/kit', () => {
    const offenders = globSync('src/ui/**/*.tsx')
      .filter((path) => !path.includes('kit') && !path.endsWith('.test.tsx'))
      // The room drawing is an illustration, not chrome: its SVG fills encode §1.3's nine
      // bindings and are the one place a literal colour is the meaning.
      .filter((path) => !path.endsWith('Room.tsx') && !path.endsWith('Character.tsx'))
      .filter((path) => TAILWIND_COLOUR.test(readFileSync(path, 'utf8')))

    expect(offenders).toEqual([])
  })
})
