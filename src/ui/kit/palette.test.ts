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
 * Matches `family-number` utilities (`bg-slate-500`), the bare/opacity-suffixed forms a
 * `family-number` pattern alone would miss (`text-white`, `bg-transparent`, `bg-black/50`),
 * and -- Ruling 43 -- the arbitrary-value colour syntax, which is the one form Ruling 7
 * names by name and the one this guard used to let straight through: `bg-[--color-ink]`,
 * `bg-[#0f172a]` and `border-[var(--color-line)]` all passed it untouched. The tree was
 * clean, so nothing was broken; the guard simply was not looking, which is the failure this
 * file exists to prevent rather than to demonstrate.
 *
 * The arbitrary alternative matches on what is INSIDE the brackets -- a hex literal, a CSS
 * variable, or a colour function -- because arbitrary values are not colour-only:
 * `text-[13px]` and `border-[3px]` are ordinary sizing and must keep passing.
 */
const TAILWIND_COLOUR =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|stone|gray|zinc|neutral|amber|yellow|orange|red|rose|pink|fuchsia|purple|violet|indigo|blue|sky|cyan|teal|emerald|green|lime)-\d{2,3}(?:\/\d{1,3})?\b|\b(?:bg|text|border|ring|fill|stroke)-(?:white|black|transparent)(?:\/\d{1,3})?\b|\b(?:bg|text|border|ring|fill|stroke)-\[(?:#|--|var\(|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\()/

/** True when `kit` is a whole path segment, not a substring -- a directory named
 *  `toolkit`, or a file named `kitchen.tsx`, must not be exempted by accident. */
const isInKit = (path: string): boolean => path.split(/[/\\]/).includes('kit')

describe('palette discipline', () => {
  it('keeps colour utilities inside src/ui/kit', () => {
    // Ruling 43: `src/ui/**` left `src/main.tsx` unguarded. Everything under `src/` is
    // globbed instead -- the headless modules carry no class names, so widening costs
    // nothing and closes the gap permanently rather than for one named file.
    const offenders = [...globSync('src/**/*.tsx'), ...globSync('src/**/*.ts')]
      .filter((path) => !isInKit(path) && !path.endsWith('.test.tsx') && !path.endsWith('.test.ts'))
      // The room drawing is an illustration, not chrome: its SVG fills encode §1.3's nine
      // bindings and are the one place a literal colour is the meaning.
      .filter((path) => !path.endsWith('Room.tsx') && !path.endsWith('Character.tsx'))
      .filter((path) => TAILWIND_COLOUR.test(readFileSync(path, 'utf8')))

    expect(offenders).toEqual([])
  })
})

/**
 * Ruling 50: the guard's own capability, asserted rather than assumed.
 *
 * The sweep above passes on a clean tree whatever `TAILWIND_COLOUR` happens to contain --
 * which is how Ruling 43's defect survived a green suite, and how Ruling 43's own fix
 * would have survived being reverted. A probe file proved the widened pattern once at
 * authoring time and was then deleted, taking the evidence with it. These fixtures are
 * that evidence, kept: revert any alternative and this file goes red on a clean tree.
 */
describe('the palette guard itself', () => {
  it.each([
    // Ruling 7's named syntax -- the three forms that used to pass straight through.
    'bg-[--color-ink]',
    'bg-[#0f172a]',
    'border-[var(--color-line)]',
    'text-[rgb(15,23,42)]',
    // The family-number and bare forms the guard has always been for.
    'bg-slate-500',
    'text-white',
    'bg-black/50',
    'bg-transparent',
  ])('catches %s', (utility) => {
    expect(TAILWIND_COLOUR.test(`<div className="${utility}" />`)).toBe(true)
  })

  it.each([
    // Arbitrary values are not colour-only: sizing must keep passing.
    'text-[13px]',
    'border-[3px]',
    'w-[42rem]',
    'grid-cols-[1fr_auto]',
    // Nothing to do with colour utilities at all.
    'bg-surface',
    'text-ink',
  ])('leaves %s alone', (utility) => {
    expect(TAILWIND_COLOUR.test(`<div className="${utility}" />`)).toBe(false)
  })
})
