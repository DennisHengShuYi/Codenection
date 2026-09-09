# Six Features, Two Screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse eleven room objects and eight scattered panels into six features across two screens, on a real design system.

**Architecture:** Pure modules first, components second. Every screen derives from a pure, tested function (`scheduleView`, `dayGrid`, `blockActions`, `todayCard`, `cardPrecedence`) that takes the schedule and profile and returns what to draw. The room drawing becomes display-only; the week screen becomes the place you act. All UI is built from four primitives in `src/ui/kit/`, and nothing outside that directory writes a colour utility.

**Tech Stack:** React 19, TypeScript, Vite 8, Tailwind v4 (`@theme` tokens, no config file), Vitest 4 + Testing Library, jsdom.

**Spec:** `docs/superpowers/specs/2026-09-10-six-features-two-screens-design.md` — read it alongside this plan. Section references below (§3, §7, §12…) point at it. References like §1.3 or §5.2 inside *its* prose point at `burnout-app-spec-v3.md`.

## Global Constraints

- **Worktree:** `C:\Users\den51\Codenection\.claude\worktrees\four-doors`, branch `worktree-four-doors`. Run everything from there. Never `cd` to the main checkout.
- **Never `git push`.** Commit freely; pushing requires explicit confirmation.
- **Coverage thresholds are 97 statements / 91 branches / 97 functions / 98 lines** and per `.claude/CLAUDE.md` **they only ever go up.** Every new module ships with tests in the same commit. Never lower a threshold, never add `.skip`, never weaken an assertion to get green.
- **TDD is mandatory.** Write the test, watch it fail, then implement. A step that says "run it to verify it fails" is not optional.
- **Test commands:** `npm test` (whole suite), `npx vitest run <path>` (one file), `npm run typecheck`.
- **Tests never touch real credentials.** `vitest.config.ts` blanks `VITE_SUPABASE_*`, `GROQ_API_KEY` and the integration login. Do not undo this.
- **Immutability:** never mutate an object; return a new one. The whole engine depends on it.
- **Copy rule (§1.3):** the room reflects, never scolds. No streaks, no guilt, no "you should have".
- **Colour never carries meaning alone (§1.5).** Anything coloured also carries a label or shape.
- **44px minimum touch target** on every control.
- **Responsive at 320 / 390 / 768 / 1280px.** No horizontal scroll at any width.
- **Files: 200–400 lines typical, 800 hard maximum.**

---

# Phase 1 — to the demo line

## Task 1: Seeded profile fixture

Without this the accuracy line reads "not enough data" for the entire demo and Reality Check never demonstrates anything. The week is already seeded (`umCrunchWeek`); the profile is not.

**Files:**
- Create: `src/fixtures/umProfile.ts`
- Create: `src/fixtures/umProfile.test.ts`
- Create: `src/ui/useProfile.ts` (moved from `src/ui/calibration/useCalibration.ts`)
- Create: `src/ui/useProfile.test.tsx` (moved from `useCalibration`'s tests if any exist)
- Delete: `src/ui/calibration/useCalibration.ts`
- Modify: `src/ui/room/RoomShell.tsx` — import `useProfile` instead of `useCalibration`

**Interfaces:**
- Consumes: `CalibrationProfile`, `BlockOutcome` from `src/domain/calibration`; `EnergyPrediction` from `src/domain/predictions`
- Produces: `umProfile(anchoredOn: string): CalibrationProfile` — `anchoredOn` is the week's `startedOn` (YYYY-MM-DD) so predictions land on real dates in the seeded fortnight. `useProfile(repo: Repository): { profile: CalibrationProfile; setProfile: (next: CalibrationProfile) => void }`

- [ ] **Step 1: Write the failing test**

Create `src/fixtures/umProfile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LOAD_TYPES } from '../engine'
import { meanAbsoluteError } from '../domain/predictions'
import { paddingFor } from '../domain/realityCheck'
import { MIN_SAMPLES } from '../domain/realityCheck'
import { umProfile } from './umProfile'

describe('umProfile', () => {
  it('has enough confirmations per load type for Reality Check to speak', () => {
    const profile = umProfile('2026-09-01')

    for (const type of LOAD_TYPES) {
      const forType = profile.confirmations.filter((outcome) => outcome.type === type)
      expect(forType.length).toBeGreaterThanOrEqual(MIN_SAMPLES)
    }
  })

  it('carries a believable overrun bias rather than perfect estimates', () => {
    const profile = umProfile('2026-09-01')

    // A student who under-estimates. Padding above 1 is what makes §2.4 visible at all.
    expect(paddingFor(profile.confirmations, 'mental')).toBeGreaterThan(1)
  })

  it('publishes a real accuracy number instead of "not enough data"', () => {
    const profile = umProfile('2026-09-01')

    const error = meanAbsoluteError(profile.predictions)
    expect(error).not.toBeNull()
    expect(error as number).toBeGreaterThan(0)
    expect(error as number).toBeLessThan(20)
  })

  it('dates its predictions from the anchor it is given', () => {
    const profile = umProfile('2026-09-01')

    for (const prediction of profile.predictions) {
      expect(prediction.forDate >= '2026-09-01').toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/fixtures/umProfile.test.ts`
Expected: FAIL — `Failed to resolve import "./umProfile"`.

- [ ] **Step 3: Write the fixture**

Create `src/fixtures/umProfile.ts`:

```ts
import type { BlockOutcome, CalibrationProfile } from '../domain/calibration'
import { DEFAULT_PROFILE } from '../domain/calibration'
import type { EnergyPrediction } from '../domain/predictions'
import type { LoadType } from '../engine'

/**
 * A profile with history, so the demo is not a cold start.
 *
 * `umCrunchWeek` already seeds a real fortnight, but `DEFAULT_PROFILE` has no confirmations
 * and no resolved predictions -- which means the accuracy line reads "not enough data" and
 * Reality Check's padding sits at 1 for the whole demo. Those are the two things §8 exists
 * to show, so they cannot be the two things that are empty.
 *
 * The bias is deliberately an *under*-estimate: students overrun, and a fixture where every
 * block took exactly as long as planned would make §2.4 look like it does nothing.
 */

/** Planned vs actual for one kind of work, repeated to clear `MIN_SAMPLES`. */
const outcomes = (type: LoadType, planned: number, overrun: number, count: number): BlockOutcome[] =>
  Array.from({ length: count }, () => ({
    type,
    plannedHours: planned,
    actualHours: Math.round(planned * overrun * 100) / 100,
  }))

const CONFIRMATIONS: readonly BlockOutcome[] = [
  // Study is where the under-estimating happens, and by the most.
  ...outcomes('mental', 3, 1.4, 6),
  ...outcomes('physical', 1, 1.1, 4),
  ...outcomes('social', 2, 1.2, 4),
  ...outcomes('errands', 1, 1.15, 4),
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

const dayAfter = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().split('T')[0] ?? iso

/** Predicted and reported, close but never exact. Six resolved is enough for a mean that
 *  reads as measured rather than as a placeholder. */
const SCORED: ReadonlyArray<{ readonly offset: number; readonly predicted: number; readonly reported: number }> = [
  { offset: 0, predicted: 62, reported: 50 },
  { offset: 1, predicted: 55, reported: 50 },
  { offset: 2, predicted: 48, reported: 30 },
  { offset: 3, predicted: 41, reported: 30 },
  { offset: 4, predicted: 37, reported: 30 },
  { offset: 5, predicted: 44, reported: 50 },
]

export function umProfile(anchoredOn: string): CalibrationProfile {
  const predictions: EnergyPrediction[] = SCORED.map((scored) => ({
    forDate: dayAfter(anchoredOn, scored.offset),
    predicted: scored.predicted,
    reported: scored.reported,
  }))

  return { ...DEFAULT_PROFILE, confirmations: [...CONFIRMATIONS], predictions }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/fixtures/umProfile.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Move `useCalibration` to `useProfile` and wire the fixture in**

`src/ui/calibration/useCalibration.ts` is inside the directory Task 17 deletes, but the profile still has to be loaded and saved. Move it to `src/ui/useProfile.ts`, rename the exported hook to `useProfile`, keep its behaviour identical except for the fallback:

```ts
/**
 * The date the seeded profile's predictions are keyed to.
 *
 * `umCrunchWeek()` is not anchored -- `RoomShell`'s effect anchors it to `new Date()` on
 * first render, which has not happened yet when this hook resolves. So the seed uses
 * today's date directly, which is the same day that effect will choose.
 */
const seedAnchor = (): string => new Date().toISOString().split('T')[0] ?? '2026-09-01'

// inside the .then() where it currently falls back to DEFAULT_PROFILE
.then((saved) => {
  if (cancelled) return
  // §14 step 0: a profile with history, so §8's accuracy line has something to publish
  // on first open rather than "not enough data" for the whole demo.
  setLocal(saved ?? umProfile(seedAnchor()))
})
```

Add a test in `src/ui/useProfile.test.tsx` asserting that a first run resolves to a profile with
non-empty `confirmations`, and that a saved profile is returned untouched.

Read the existing file before editing to keep its guard-against-unmount and fire-and-forget-save comments intact. Update the import in `src/ui/room/RoomShell.tsx` from `../calibration/useCalibration` to `../useProfile`.

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS. If `RoomShell.calibration.test.tsx` fails on the seeded profile, that is a real behaviour change — update those assertions to the new seeded values rather than reverting the fixture.

- [ ] **Step 7: Commit**

```bash
git add src/fixtures/umProfile.ts src/fixtures/umProfile.test.ts src/ui/useProfile.ts src/ui/room/RoomShell.tsx
git rm src/ui/calibration/useCalibration.ts
git commit -m "feat: seed a profile with history so the accuracy line has something to say"
```

---

## Task 2: Design tokens, Button and Card

§12. Nine colour families and eighteen hand-written primary buttons become one token set and two components. **This comes before any screen** — every screen from Task 6 onward is written against it, so it is paid for once.

**Files:**
- Modify: `src/styles.css`
- Create: `src/ui/kit/Button.tsx`, `src/ui/kit/Button.test.tsx`
- Create: `src/ui/kit/Card.tsx`, `src/ui/kit/Card.test.tsx`

**Interfaces:**
- Produces:
  - `Button({ variant?: 'primary' | 'secondary' | 'quiet', size?: 'lg' | 'sm', ...ButtonHTMLAttributes })` — defaults `variant="primary"`, `size="lg"`
  - `Card({ tone?: 'attention' | 'calm', children, ...HTMLAttributes })` — no tone is the plain surface

- [ ] **Step 1: Write the failing tests**

Create `src/ui/kit/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('is a real button that fires on click', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Rebalance</Button>)

    await userEvent.click(screen.getByRole('button', { name: 'Rebalance' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('defaults to the primary variant', () => {
    render(<Button>Go</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('data-variant', 'primary')
  })

  it('carries the variant and size it is given', () => {
    render(
      <Button variant="quiet" size="sm">
        Not today
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('data-variant', 'quiet')
    expect(button).toHaveAttribute('data-size', 'sm')
  })

  it('passes through disabled', () => {
    render(<Button disabled>Working…</Button>)

    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('defaults type to button, so it never submits a form by accident', () => {
    render(<Button>Go</Button>)

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})
```

Create `src/ui/kit/Card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card'

describe('Card', () => {
  it('renders its children', () => {
    render(<Card>Two things have lapsed</Card>)

    expect(screen.getByText('Two things have lapsed')).toBeInTheDocument()
  })

  it('has no tone by default', () => {
    render(<Card data-testid="card">plain</Card>)

    expect(screen.getByTestId('card')).toHaveAttribute('data-tone', 'none')
  })

  it('carries the tone it is given', () => {
    render(
      <Card tone="attention" data-testid="card">
        needs you
      </Card>,
    )

    expect(screen.getByTestId('card')).toHaveAttribute('data-tone', 'attention')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/kit`
Expected: FAIL — cannot resolve `./Button` and `./Card`.

- [ ] **Step 3: Add the tokens**

Replace `src/styles.css` entirely:

```css
@import 'tailwindcss';

/*
 * §12: the palette comes from the room.
 *
 * Before this file existed as anything but an import, nine colour families were in use
 * across seventeen background utilities, chosen per component in whichever session built
 * it -- violet micro-start, sky prescription, amber door panel, rose, indigo, emerald.
 * Three semantic accents is the whole budget: more than three and none of them mean
 * anything.
 */
@theme {
  /* Ground and ink. The room's own warm cream, so the interface sits in the room rather
     than beside it. */
  --color-ground: #faf8f4;
  --color-surface: #ffffff;
  --color-line: #e3ddd2;
  --color-ink: #1c1917;
  /* Replaces every opacity-70. Opacity fades the background through the text and cannot
     be themed; a colour can be both. */
  --color-ink-soft: #6b635a;

  /* The three accents, and nothing else. */
  --color-attention: #f59e0b; /* needs you: stuck, lapsed, deficit, unconfirmed */
  --color-attention-soft: #fffbeb;
  --color-calm: #0284c7; /* recovery, rest, protected blocks */
  --color-calm-soft: #f0f9ff;

  /* Load-type hues, for calendar blocks only, and never carrying meaning alone (§1.5) --
     every block also shows its label and its type in words. Amber is deliberately not
     among them so "needs you" stays unambiguous everywhere. */
  --color-load-mental: #6366f1;
  --color-load-physical: #0d9488;
  --color-load-social: #f43f5e;
  --color-load-errands: #78716c;
}

body {
  background: var(--color-ground);
  color: var(--color-ink);
}
```

- [ ] **Step 4: Write Button and Card**

Create `src/ui/kit/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'
export type ButtonSize = 'lg' | 'sm'

/**
 * The only button in the app.
 *
 * `rounded-lg bg-slate-900 px-4 py-3 text-white` was hand-written eighteen times across
 * twelve files, which is how the app ended up with three different secondary buttons and
 * no way to change any of them at once.
 *
 * Every variant clears 44px, including `quiet` -- a text link is still something a thumb
 * has to hit, and the underlined "Not now" links this replaces were 20px tall.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[--color-ink] text-white',
  secondary: 'border border-[--color-line] bg-[--color-surface] text-[--color-ink]',
  quiet: 'text-[--color-ink-soft] underline underline-offset-2',
}

const SIZES: Record<ButtonSize, string> = {
  lg: 'min-h-11 px-4 py-3 text-sm',
  sm: 'min-h-11 px-3 py-2 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  className = '',
  type = 'button',
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      // Defaulted rather than required: a bare <button> inside a form submits it, and that
      // bug is invisible until the one screen that has a form.
      type={type}
      data-variant={variant}
      data-size={size}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 motion-reduce:transition-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}
```

Create `src/ui/kit/Card.tsx`:

```tsx
import type { HTMLAttributes } from 'react'

export type CardTone = 'attention' | 'calm'

/**
 * One card, three tones.
 *
 * Each feature used to bring its own: violet-50 for micro-start, sky-50 for the
 * prescription, amber-50 for the door panel, slate-100 for the drafts. The colours meant
 * nothing collectively -- they were just whatever the session that built each one reached
 * for.
 */
const TONES: Record<CardTone, string> = {
  attention: 'border-[--color-attention] bg-[--color-attention-soft]',
  calm: 'border-[--color-calm] bg-[--color-calm-soft]',
}

export function Card({
  tone,
  className = '',
  ...rest
}: { tone?: CardTone } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      data-tone={tone ?? 'none'}
      className={`rounded-xl border p-4 ${tone ? TONES[tone] : 'border-[--color-line] bg-[--color-surface]'} ${className}`}
    />
  )
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/ui/kit`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css src/ui/kit/
git commit -m "feat: add design tokens and the first two kit primitives"
```

---

## Task 3: Field and Sheet

`Sheet` replaces `ZoomLayer`. It keeps everything `ZoomLayer` got right — focus on open, Escape to close, `role="dialog"`, `aria-modal` — and fixes what it got wrong: the back link sits at the top and every panel scatters its own buttons wherever they land, against §0.2's rule that primary actions belong in the lower half on mobile.

**Files:**
- Create: `src/ui/kit/Field.tsx`, `src/ui/kit/Field.test.tsx`
- Create: `src/ui/kit/Sheet.tsx`, `src/ui/kit/Sheet.test.tsx`

**Interfaces:**
- Consumes: `Button` from Task 2
- Produces:
  - `Field({ label, help?, error?, children })` — wraps one control, wires `aria-describedby`
  - `Sheet({ title, onClose, actions?, children })` — `actions` is a ReactNode rendered into the pinned bottom bar

- [ ] **Step 1: Write the failing tests**

Create `src/ui/kit/Sheet.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { Sheet } from './Sheet'

const setup = (actions?: React.ReactNode) => {
  const onClose = vi.fn()
  render(
    <Sheet title="FYP meeting" onClose={onClose} actions={actions}>
      <p>14:00–16:00</p>
    </Sheet>,
  )
  return { onClose }
}

describe('Sheet', () => {
  it('is a modal dialog named by its title', () => {
    setup()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName('FYP meeting')
  })

  it('takes focus on open, so a keyboard user is not left at the top of the document', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveFocus()
  })

  it('closes on Escape', async () => {
    const { onClose } = setup()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes from the close control', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders actions into the pinned bar rather than into the body', () => {
    setup(<Button>Done</Button>)

    const bar = screen.getByTestId('sheet-actions')
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Done' }))
  })

  it('has no action bar when it is given no actions', () => {
    setup()

    expect(screen.queryByTestId('sheet-actions')).not.toBeInTheDocument()
  })
})
```

Create `src/ui/kit/Field.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

describe('Field', () => {
  it('labels its control', () => {
    render(
      <Field label="What you were asked">
        <textarea />
      </Field>,
    )

    expect(screen.getByLabelText('What you were asked')).toBeInTheDocument()
  })

  it('describes its control with the help text', () => {
    render(
      <Field label="Hours" help="Roughly is fine">
        <input />
      </Field>,
    )

    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Roughly is fine')
  })

  it('announces an error and prefers it over the help text', () => {
    render(
      <Field label="Hours" help="Roughly is fine" error="That is not a number">
        <input />
      </Field>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('That is not a number')
    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is not a number')
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/kit/Sheet.test.tsx src/ui/kit/Field.test.tsx`
Expected: FAIL — cannot resolve `./Sheet` and `./Field`.

- [ ] **Step 3: Write Field**

Create `src/ui/kit/Field.tsx`:

```tsx
import { cloneElement, useId, type ReactElement } from 'react'

/**
 * Label, control, help, error -- wired together rather than hoped for.
 *
 * The forms in this app were each built with their own <label> markup, and two of them
 * described their inputs with plain text that no screen reader ever connected to the
 * control. This makes the wiring the default.
 */
export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string
  help?: string
  error?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}) {
  const id = useId()
  const noteId = `${id}-note`
  // The error replaces the help rather than joining it: two descriptions read out in
  // sequence is how a screen-reader user hears "roughly is fine that is not a number".
  const note = error ?? help

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[--color-ink]">
        {label}
      </label>

      {cloneElement(children, {
        id,
        'aria-describedby': note === undefined ? undefined : noteId,
        'aria-invalid': error === undefined ? undefined : true,
      })}

      {note !== undefined && (
        <p
          id={noteId}
          role={error === undefined ? undefined : 'alert'}
          className={`text-xs ${error === undefined ? 'text-[--color-ink-soft]' : 'text-[--color-attention]'}`}
        >
          {note}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Write Sheet**

Create `src/ui/kit/Sheet.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The container every button opens.
 *
 * Replaces `ZoomLayer`, keeping the three things it got right -- focus on open, Escape to
 * close, and real dialog semantics -- and fixing the one it got wrong. `ZoomLayer` put
 * "Back to the room" at the *top* and left each panel to place its own buttons wherever
 * they fell: mid-screen in the desk panel, after a paragraph in `Prescription`, under a
 * textarea in the planner. §0.2 wants primary actions in the lower half on mobile, so the
 * action bar is pinned here and panels stop deciding.
 *
 * Below 768px it takes the viewport, because a brain-dump box squeezed into a corner of a
 * phone is unusable. Above it, it centres and the room stays visible around the edges.
 */
export function Sheet({
  title,
  onClose,
  actions,
  children,
}: {
  title: string
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
  }, [title])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={panel}
      tabIndex={-1}
      data-testid="sheet"
      className="fixed inset-0 z-20 flex flex-col bg-[--color-surface] md:inset-x-[12.5%] md:inset-y-8 md:rounded-2xl md:shadow-2xl md:ring-1 md:ring-black/10"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[--color-line] p-4">
        <h2 className="text-lg font-medium text-[--color-ink]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-[--color-ink-soft] focus-visible:outline focus-visible:outline-2"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

      {actions !== undefined && (
        <div
          data-testid="sheet-actions"
          className="flex shrink-0 flex-wrap gap-2 border-t border-[--color-line] p-4"
        >
          {actions}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/ui/kit`
Expected: PASS, 17 tests across four files.

- [ ] **Step 6: Commit**

```bash
git add src/ui/kit/Field.tsx src/ui/kit/Field.test.tsx src/ui/kit/Sheet.tsx src/ui/kit/Sheet.test.tsx
git commit -m "feat: add Field and Sheet, pinning actions to the lower half"
```

---

## Task 4: `scheduleView` — the overview grid's data

§4. Pure, no React. Turns the schedule into 21 cells, each with a load band, a deficit mark and an unconfirmed mark.

**Files:**
- Create: `src/ui/week/scheduleView.ts`, `src/ui/week/scheduleView.test.ts`

**Interfaces:**
- Consumes: `Schedule` from `src/optimizer`; `CalibrationProfile` from `src/domain/calibration`; `project`, `overallReserve`, `DEFICIT_THRESHOLD`, `HORIZON_DAYS` from `src/engine`; `toDayInputs` from `src/optimizer`; `dateFor` from `src/domain/calendar`; `paramsFor` from `src/domain/engineParams`
- Produces:

```ts
export type LoadBand = 'light' | 'busy' | 'heavy'

export interface DayCell {
  readonly dayIndex: number
  readonly date: string | null
  readonly band: LoadBand
  readonly hours: number
  readonly deficit: boolean
  readonly unconfirmed: boolean
  readonly isToday: boolean
}

export function scheduleView(input: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly today: number
}): readonly DayCell[]
```

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/scheduleView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { BUSY_ABOVE_HOURS, HEAVY_ABOVE_HOURS, scheduleView } from './scheduleView'

const item = (id: string, dayIndex: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[] = [], over: Partial<Schedule> = {}): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const view = (schedule = week(), profile = DEFAULT_PROFILE, today = 0) =>
  scheduleView({ schedule, profile, today })

describe('scheduleView', () => {
  it('returns one cell per day of the horizon', () => {
    expect(view()).toHaveLength(HORIZON_DAYS)
  })

  it('reads light when a day is empty', () => {
    expect(view()[3]?.band).toBe('light')
  })

  it('reads busy at the threshold and light just under it', () => {
    const busy = view(week([item('a', 2, BUSY_ABOVE_HOURS)]))
    const light = view(week([item('a', 2, BUSY_ABOVE_HOURS - 0.5)]))

    expect(busy[2]?.band).toBe('busy')
    expect(light[2]?.band).toBe('light')
  })

  it('reads heavy at the threshold', () => {
    expect(view(week([item('a', 2, HEAVY_ABOVE_HOURS)]))[2]?.band).toBe('heavy')
  })

  it('sums every block on the day rather than taking the longest', () => {
    const cells = view(week([item('a', 4, 3), item('b', 4, 4)]))

    expect(cells[4]?.hours).toBe(7)
  })

  it('marks the day the student is on', () => {
    const cells = view(week(), DEFAULT_PROFILE, 5)

    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.dayIndex)).toEqual([5])
  })

  it('marks a day carrying a block that has not been confirmed', () => {
    // Only days at or before today can have been lived, so only those are marked.
    const cells = view(week([item('a', 1, 2)]), DEFAULT_PROFILE, 3)

    expect(cells[1]?.unconfirmed).toBe(true)
  })

  it('does not mark a confirmed block, or a day still ahead', () => {
    const confirmed = { ...DEFAULT_PROFILE, confirmedItemIds: ['a'] }
    const cells = view(week([item('a', 1, 2), item('b', 9, 2)]), confirmed, 3)

    expect(cells[1]?.unconfirmed).toBe(false)
    expect(cells[9]?.unconfirmed).toBe(false)
  })

  it('marks deficit days from the projection, not from hours', () => {
    // A fortnight that starts flat is in deficit regardless of how empty the days look.
    const flat = week([], { start: { mental: 5, physical: 5, social: 5, errands: 5 } })

    expect(view(flat).some((cell) => cell.deficit)).toBe(true)
    expect(view().some((cell) => cell.deficit)).toBe(false)
  })

  it('carries the real date when the week is anchored, and null when it is not', () => {
    expect(view()[0]?.date).toBeNull()
    expect(view(week([], { startedOn: '2026-09-01' }))[0]?.date).toBe('2026-09-01')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/week/scheduleView.test.ts`
Expected: FAIL — cannot resolve `./scheduleView`.

- [ ] **Step 3: Implement**

Create `src/ui/week/scheduleView.ts`:

```ts
import { dateFor } from '../../domain/calendar'
import type { CalibrationProfile } from '../../domain/calibration'
import { paramsFor } from '../../domain/engineParams'
import { DEFICIT_THRESHOLD, HORIZON_DAYS, overallReserve, project } from '../../engine'
import { toDayInputs, type Schedule } from '../../optimizer'

/**
 * §4's overview: the whole horizon as 21 cells.
 *
 * Pure, and takes `today` as a parameter rather than reading a clock -- the same rule the
 * engine and `roomModel` follow, and the reason any of this can be tested at all.
 */

/** Where a day stops reading as light. Roughly a full timetabled day. */
export const BUSY_ABOVE_HOURS = 6
/** Where it stops reading as survivable. */
export const HEAVY_ABOVE_HOURS = 10

export type LoadBand = 'light' | 'busy' | 'heavy'

export interface DayCell {
  readonly dayIndex: number
  /** Null for a week saved before anchoring existed. */
  readonly date: string | null
  readonly band: LoadBand
  readonly hours: number
  /** From the projection, not from the hours: a light day can still be a deficit day if the
   *  fortnight around it has already emptied the student. */
  readonly deficit: boolean
  /** A block on a day already lived that has not been asked about. Drives §4's mark, so the
   *  confirmation prompt is discoverable from the overview and not only from the card. */
  readonly unconfirmed: boolean
  readonly isToday: boolean
}

const bandFor = (hours: number): LoadBand =>
  hours >= HEAVY_ABOVE_HOURS ? 'heavy' : hours >= BUSY_ABOVE_HOURS ? 'busy' : 'light'

export function scheduleView({
  schedule,
  profile,
  today,
}: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly today: number
}): readonly DayCell[] {
  const projection = project(schedule.start, toDayInputs(schedule), paramsFor(profile))

  return Array.from({ length: HORIZON_DAYS }, (_, dayIndex): DayCell => {
    const onDay = schedule.items.filter((item) => item.dayIndex === dayIndex)
    const hours = onDay.reduce((total, item) => total + item.hours, 0)
    const reserves = projection.central[dayIndex]

    return {
      dayIndex,
      date: dateFor(schedule, dayIndex),
      band: bandFor(hours),
      hours,
      deficit: reserves !== undefined && overallReserve(reserves) < DEFICIT_THRESHOLD,
      // A day still ahead cannot have been lived, so asking about it would be asking a
      // student to report the future.
      unconfirmed:
        dayIndex <= today &&
        onDay.some((item) => !profile.confirmedItemIds.includes(item.id)),
      isToday: dayIndex === today,
    }
  })
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/week/scheduleView.test.ts`
Expected: PASS, 10 tests. If the deficit test fails, check `project`'s return shape — it exposes `central` as an array of `Reserves` per day.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/scheduleView.ts src/ui/week/scheduleView.test.ts
git commit -m "feat: derive the 21-day overview from the schedule"
```

---

## Task 5: `dayGrid` — the hour grid's data

§4. One day's blocks, positioned by start time and sized by duration, with the hour range derived rather than fixed.

**Files:**
- Create: `src/ui/week/dayGrid.ts`, `src/ui/week/dayGrid.test.ts`

**Interfaces:**
- Consumes: `Schedule`, `ScheduledItem` from `src/optimizer`; `blocksOnDay` from `src/domain/dayBlocks`
- Produces:

```ts
export interface GridBlock {
  readonly item: ScheduledItem
  readonly topPercent: number
  readonly heightPercent: number
}

export interface DayGrid {
  readonly firstHour: number
  readonly lastHour: number
  readonly hours: readonly number[]
  readonly blocks: readonly GridBlock[]
}

export function dayGrid(schedule: Schedule, dayIndex: number): DayGrid
```

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/dayGrid.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { DEFAULT_FIRST_HOUR, DEFAULT_LAST_HOUR, dayGrid } from './dayGrid'

const item = (id: string, startHour: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex: 0,
  startHour,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('dayGrid', () => {
  it('falls back to a sensible window on an empty day, rather than rendering nothing', () => {
    const grid = dayGrid(week([]), 0)

    expect(grid.firstHour).toBe(DEFAULT_FIRST_HOUR)
    expect(grid.lastHour).toBe(DEFAULT_LAST_HOUR)
    expect(grid.blocks).toEqual([])
  })

  it('derives the window from the day, with an hour of air either side', () => {
    const grid = dayGrid(week([item('a', 9, 2)]), 0)

    expect(grid.firstHour).toBe(8)
    expect(grid.lastHour).toBe(12)
  })

  it('never runs past midnight or before midnight', () => {
    const grid = dayGrid(week([item('a', 0, 1), item('b', 23, 1)]), 0)

    expect(grid.firstHour).toBe(0)
    expect(grid.lastHour).toBe(24)
  })

  it('lists every hour in the window inclusive of the last', () => {
    const grid = dayGrid(week([item('a', 9, 1)]), 0)

    expect(grid.hours).toEqual([8, 9, 10, 11])
  })

  it('positions a block by its start and sizes it by its duration', () => {
    // Window 8..12 is four hours. A 2h block at 09:00 starts a quarter in and covers half.
    const grid = dayGrid(week([item('a', 9, 2)]), 0)

    expect(grid.blocks[0]?.topPercent).toBeCloseTo(25)
    expect(grid.blocks[0]?.heightPercent).toBeCloseTo(50)
  })

  it('orders blocks as the day happens', () => {
    const grid = dayGrid(week([item('late', 20, 1), item('early', 9, 1)]), 0)

    expect(grid.blocks.map((block) => block.item.id)).toEqual(['early', 'late'])
  })

  it('reads only the day it was asked for', () => {
    const other = { ...item('other', 9, 1), dayIndex: 4 }
    const grid = dayGrid(week([item('mine', 9, 1), other]), 0)

    expect(grid.blocks.map((block) => block.item.id)).toEqual(['mine'])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/week/dayGrid.test.ts`
Expected: FAIL — cannot resolve `./dayGrid`.

- [ ] **Step 3: Implement**

Create `src/ui/week/dayGrid.ts`:

```ts
import { blocksOnDay } from '../../domain/dayBlocks'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §4's day view: one column, so it survives 320px where seven columns cannot.
 *
 * The window is derived from the day rather than fixed at 00:00–24:00, because a fixed
 * window renders an empty day as twenty-four rows of nothing and a two-block day as two
 * blocks lost in a field.
 */

/** Used when there is nothing to derive a window from. Waking hours a student would
 *  recognise as "the day", rather than a full 24 that makes one block look tiny. */
export const DEFAULT_FIRST_HOUR = 8
export const DEFAULT_LAST_HOUR = 22

export interface GridBlock {
  readonly item: ScheduledItem
  /** Percentages of the grid's height, so the layout is resolution-independent and the
   *  component needs no measurement pass. */
  readonly topPercent: number
  readonly heightPercent: number
}

export interface DayGrid {
  readonly firstHour: number
  readonly lastHour: number
  /** Every label to draw down the left, inclusive of `lastHour`. */
  readonly hours: readonly number[]
  readonly blocks: readonly GridBlock[]
}

const clampHour = (hour: number): number => Math.min(24, Math.max(0, hour))

export function dayGrid(schedule: Schedule, dayIndex: number): DayGrid {
  const items = blocksOnDay(schedule, dayIndex)

  const firstHour =
    items.length === 0
      ? DEFAULT_FIRST_HOUR
      : clampHour(Math.floor(Math.min(...items.map((item) => item.startHour))) - 1)

  const lastHour =
    items.length === 0
      ? DEFAULT_LAST_HOUR
      : clampHour(Math.ceil(Math.max(...items.map((item) => item.startHour + item.hours))) + 1)

  const span = lastHour - firstHour

  return {
    firstHour,
    lastHour,
    hours: Array.from({ length: span + 1 }, (_, index) => firstHour + index),
    // `blocksOnDay` already sorts by start hour and returns a copy, so the schedule handed
    // in is never reordered.
    blocks: items.map((item) => ({
      item,
      topPercent: ((item.startHour - firstHour) / span) * 100,
      heightPercent: (item.hours / span) * 100,
    })),
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/week/dayGrid.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/dayGrid.ts src/ui/week/dayGrid.test.ts
git commit -m "feat: lay out one day as an hour grid"
```

---

## Task 6: `WeekScreen` — overview, day and Rebalance

§4. The new primary surface. Built on `kit/` from its first commit.

**Files:**
- Create: `src/ui/week/WeekScreen.tsx`, `src/ui/week/WeekScreen.test.tsx`

**Interfaces:**
- Consumes: `scheduleView`, `DayCell`, `LoadBand` (Task 4); `dayGrid` (Task 5); `Button`, `Card` (Task 2)
- Produces: `WeekScreen({ schedule, profile, today, working, report, onRebalance, onSelectBlock })`

```ts
export function WeekScreen(props: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly today: number
  readonly working: boolean
  readonly report: string | null
  readonly onRebalance: () => void
  readonly onSelectBlock: (itemId: string) => void
}): JSX.Element
```

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/WeekScreen.test.tsx`. Cover: 21 day buttons render; a day opens its grid below the overview; Rebalance stays above the opened day; a block click reports its id; the deficit day is named in text and not only coloured; the working state disables the button.

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { WeekScreen } from './WeekScreen'

const item = (id: string, dayIndex: number, startHour = 9, hours = 2): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[] = []): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const setup = (schedule = week(), over: Partial<Parameters<typeof WeekScreen>[0]> = {}) => {
  const onRebalance = vi.fn()
  const onSelectBlock = vi.fn()

  render(
    <WeekScreen
      schedule={schedule}
      profile={DEFAULT_PROFILE}
      today={0}
      working={false}
      report={null}
      onRebalance={onRebalance}
      onSelectBlock={onSelectBlock}
      {...over}
    />,
  )

  return { onRebalance, onSelectBlock }
}

describe('WeekScreen', () => {
  it('shows the whole horizon at once', () => {
    setup()

    expect(screen.getAllByTestId(/^day-\d+$/)).toHaveLength(HORIZON_DAYS)
  })

  it('opens a day when it is tapped', async () => {
    setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))

    expect(within(screen.getByTestId('day-grid')).getByText('essay')).toBeInTheDocument()
  })

  it('keeps Rebalance above the opened day, because it acts on the fortnight', async () => {
    setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))

    const rebalance = screen.getByTestId('rebalance')
    const grid = screen.getByTestId('day-grid')
    expect(rebalance.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('reports which block was chosen', async () => {
    const { onSelectBlock } = setup(week([item('essay', 3)]))

    await userEvent.click(screen.getByTestId('day-3'))
    await userEvent.click(screen.getByTestId('block-essay'))

    expect(onSelectBlock).toHaveBeenCalledWith('essay')
  })

  it('names a day s load in words, never only by shade', async () => {
    setup(week([item('a', 2, 9, 11)]))

    expect(screen.getByTestId('day-2')).toHaveAccessibleName(/heavy/i)
  })

  it('says what it is doing while the solver runs', () => {
    setup(week(), { working: true })

    expect(screen.getByTestId('rebalance')).toBeDisabled()
    expect(screen.getByTestId('rebalance')).toHaveTextContent(/working/i)
  })

  it('reports what rebalancing changed', () => {
    setup(week(), { report: 'Moved the essay a day later.' })

    expect(screen.getByTestId('rebalance-report')).toHaveTextContent('Moved the essay a day later.')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/week/WeekScreen.test.tsx`
Expected: FAIL — cannot resolve `./WeekScreen`.

- [ ] **Step 3: Implement**

Create `src/ui/week/WeekScreen.tsx`. Requirements the tests pin down, plus the ones they cannot:

- `useState<number | null>` for the open day; `null` means none open.
- Overview is a `<ul>` of 21 `<button data-testid={`day-${i}`}>`. Each button's `aria-label` is the date (or `Day N` unanchored), the band word, and `— deficit` / `— not confirmed` when those apply. **The band word is in the label, not only the shade** (§1.5).
- Band shades: `light` → `bg-[--color-line]/40`, `busy` → `bg-[--color-attention]/30`, `heavy` → `bg-[--color-attention]/70`. Deficit adds a `⚠` glyph rendered `aria-hidden`, since the word is already in the label.
- `Rebalance` is a `Button` with `data-testid="rebalance"`, rendered **between** the overview and the day grid, and it does not move when a day opens.
- The report is `<p data-testid="rebalance-report" role="status">`.
- Day grid: `data-testid="day-grid"`, a relative container with `hours.length - 1` rows of labels down the left, and each block absolutely positioned using `topPercent` / `heightPercent`. Each block is a `<button data-testid={`block-${id}`}>` carrying the title, the type **in words**, the time range, and `🔒` / `🛡` with matching text for `fixed` / `protectedRest`.
- Block hue from the load type, via the four `--color-load-*` tokens.
- Below 768px the overview cells are square and the grid is full width; above it, cap the grid at `max-w-2xl`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/week/WeekScreen.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Check it at 320px**

Run: `npm run dev`, open at 320px wide, confirm no horizontal scroll with a day open.

- [ ] **Step 6: Commit**

```bash
git add src/ui/week/WeekScreen.tsx src/ui/week/WeekScreen.test.tsx
git commit -m "feat: add the week screen"
```

---

## Task 6b: Surface `smallestFixes` as Rebalance's fallback

§4. `smallestFixes` is built, tested and reachable from nowhere. §2.5 warns the movable set may
be tiny for a real final-year student — which makes "here is the one thing that would help" the
more honest headline rather than a consolation prize.

**Files:**
- Create: `src/ui/week/rebalanceOutcome.ts`, `src/ui/week/rebalanceOutcome.test.ts`
- Modify: `src/ui/week/WeekScreen.tsx`, `WeekScreen.test.tsx`

**Interfaces:**
- Consumes: `rebalance`, `describeRebalance`, `smallestFixes`, `type Fix`, `makeRng` from `src/optimizer`
- Produces:

```ts
export interface RebalanceOutcome {
  /** The week to adopt. Unchanged from the input when the solver found nothing. */
  readonly schedule: Schedule
  readonly report: string
  /** The single best remaining move, when the solver could not improve the fortnight
   *  but the fortnight still needs help. Null otherwise. */
  readonly fallback: Fix | null
}

export function runRebalance(schedule: Schedule, params: EngineParams, seed: number): RebalanceOutcome
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { runRebalance } from './rebalanceOutcome'

const SEED = 20260908

const fixed = (id: string, dayIndex: number, hours: number): ScheduledItem => ({
  id,
  title: id,
  type: 'mental',
  kind: 'studyBlock',
  hours,
  intensity: 1,
  dayIndex,
  startHour: 9,
  // Nothing movable: the case §2.5 says to expect for a real final-year student.
  fixed: true,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[], over: Partial<Schedule> = {}): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

describe('runRebalance', () => {
  it('always reports something, even when it changed nothing', () => {
    const outcome = runRebalance(week([]), DEFAULT_PARAMS, SEED)

    expect(outcome.report.length).toBeGreaterThan(0)
  })

  it('offers no fallback for a week that does not need one', () => {
    expect(runRebalance(week([]), DEFAULT_PARAMS, SEED).fallback).toBeNull()
  })

  it('offers the single best remaining move when it cannot improve a struggling week', () => {
    // Everything fixed, so the solver has nothing to move, and the reserves start low
    // enough that the fortnight genuinely needs help.
    const stuck = week(
      [fixed('a', 1, 8), fixed('b', 2, 8), fixed('c', 3, 8)],
      { start: { mental: 20, physical: 20, social: 20, errands: 20 } },
    )

    const outcome = runRebalance(stuck, DEFAULT_PARAMS, SEED)

    expect(outcome.fallback).not.toBeNull()
  })

  it('is reproducible, so the student does not see a different answer each render', () => {
    const first = runRebalance(week([]), DEFAULT_PARAMS, SEED)
    const second = runRebalance(week([]), DEFAULT_PARAMS, SEED)

    expect(first.report).toBe(second.report)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/week/rebalanceOutcome.test.ts`
Expected: FAIL — cannot resolve `./rebalanceOutcome`.

- [ ] **Step 3: Implement**

```ts
import type { EngineParams } from '../../engine'
import {
  describeRebalance,
  makeRng,
  rebalance,
  smallestFixes,
  type Fix,
  type Schedule,
} from '../../optimizer'

/**
 * §4: rebalance, and what to say when it cannot help.
 *
 * `smallestFixes` has been built and tested since the optimizer landed and has never been
 * reachable from any screen. §2.5 warns that a real final-year student's movable set may be
 * almost empty -- so "your fortnight has nothing to move, but here is the one thing that
 * would help most" is not a consolation prize, it is the more likely headline.
 */
export interface RebalanceOutcome {
  readonly schedule: Schedule
  readonly report: string
  readonly fallback: Fix | null
}

export function runRebalance(
  schedule: Schedule,
  params: EngineParams,
  seed: number,
): RebalanceOutcome {
  // Seeded rather than random: §2.1's search takes its randomness as a parameter, and a
  // student who taps twice should not see two different weeks.
  const result = rebalance(schedule, params, makeRng(seed))
  const report = describeRebalance(result, params)

  // `describeRebalance` already distinguishes a healthy week with nothing to move from an
  // overloaded one, so the fallback is only wanted in the second case -- and only when the
  // solver itself found nothing, otherwise it would be second-guessing a real improvement.
  const fallback =
    result.moves.length === 0 ? (smallestFixes(schedule, params, 1)[0] ?? null) : null

  return { schedule: result.schedule, report, fallback }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/week/rebalanceOutcome.test.ts`
Expected: PASS, 4 tests. If the fallback test fails, check `smallestFixes`' third parameter — it
defaults to 3 and the call above narrows it to 1.

- [ ] **Step 5: Render the fallback in `WeekScreen`**

Add a `fallback: Fix | null` prop beside `report`. When present, render under the report:

```tsx
{fallback !== null && (
  <p data-testid="rebalance-fallback" role="status" className="text-sm text-[--color-ink-soft]">
    There is almost nothing to move. The one thing that would help most: move{' '}
    {fallback.move.itemId} to day {fallback.move.toDay}.
  </p>
)}
```

Check `Move`'s actual field names in `src/optimizer/types.ts` before writing this — use them
rather than the names above if they differ.

Add a `WeekScreen` test asserting the fallback renders when given and is absent when null.

- [ ] **Step 6: Run the suite and commit**

```bash
npx vitest run src/ui/week
git add src/ui/week/
git commit -m "feat: offer the single best move when rebalance cannot improve the week"
```

---

## Task 7: `blockActions` — what a block offers

§5. The single largest consolidation: done, later, move, micro-start and confirmation are five states of a block, not five features.

**Files:**
- Create: `src/ui/week/blockActions.ts`, `src/ui/week/blockActions.test.ts`

**Interfaces:**
- Consumes: `ScheduledItem`, `Schedule`; `CalibrationProfile`; `isStuck`, `firstAction`, `MicroStart` from `src/domain/microStart`
- Produces:

```ts
export type BlockAction = 'done' | 'later' | 'move' | 'cantStart' | 'confirm' | 'undo' | 'didRest'

export interface BlockSheetModel {
  readonly item: ScheduledItem
  readonly actions: readonly BlockAction[]
  readonly microStart: MicroStart | null
}

export function blockSheet(input: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly itemId: string
  readonly today: number
}): BlockSheetModel | null
```

Returns `null` when the id matches nothing, so a stale id closes the sheet rather than crashing.

- [ ] **Step 1: Write the failing test**

Create `src/ui/week/blockActions.test.ts`, one case per row of §5's table:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { STUCK_AFTER_DAYS } from '../../domain/microStart'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { blockSheet } from './blockActions'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'essay',
  title: 'Essay draft',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 5,
  startHour: 20,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const sheet = (one: ScheduledItem, profile = DEFAULT_PROFILE, today = 5) =>
  blockSheet({ schedule: week([one]), profile, itemId: one.id, today })

describe('blockSheet', () => {
  it('offers the full set for a movable block today or later', () => {
    expect(sheet(item())?.actions).toEqual(['done', 'later', 'move', 'cantStart'])
  })

  it('offers only Done for a fixed block, because the optimizer cannot move it either', () => {
    expect(sheet(item({ fixed: true }))?.actions).toEqual(['done'])
  })

  it('asks protected rest whether it actually happened', () => {
    expect(sheet(item({ protectedRest: true, fixed: true }))?.actions).toEqual(['didRest'])
  })

  it('asks a past block that has not been confirmed how it went', () => {
    expect(sheet(item({ dayIndex: 2 }))?.actions).toEqual(['confirm'])
  })

  it('offers Undo on a past block already answered', () => {
    const profile = { ...DEFAULT_PROFILE, confirmedItemIds: ['essay'] }

    expect(sheet(item({ dayIndex: 2 }), profile)?.actions).toEqual(['undo'])
  })

  it('opens the micro-start unasked once a task has sat three days', () => {
    const stuck = item({ dayIndex: 5 - STUCK_AFTER_DAYS })

    // Past, so it would normally be a confirm -- but a stuck task is the case §4.1 cares
    // about and the micro-start rides along regardless of which actions are offered.
    expect(sheet(stuck)?.microStart).not.toBeNull()
  })

  it('does not offer a micro-start for something that is not stuck', () => {
    expect(sheet(item())?.microStart).toBeNull()
  })

  it('returns null for an id that no longer exists', () => {
    expect(blockSheet({ schedule: week([]), profile: DEFAULT_PROFILE, itemId: 'gone', today: 0 }))
      .toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/week/blockActions.test.ts`
Expected: FAIL — cannot resolve `./blockActions`.

- [ ] **Step 3: Implement**

Create `src/ui/week/blockActions.ts`:

```ts
import type { CalibrationProfile } from '../../domain/calibration'
import { firstAction, isStuck, type MicroStart } from '../../domain/microStart'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §5: what a block offers, derived from the block.
 *
 * Done, Later, Move, micro-start and confirmation were five entries on a feature list. They
 * are five *states of a block*, and collapsing them here is what lets the week screen carry
 * all of them without a row of five buttons that are mostly wrong.
 */
export type BlockAction = 'done' | 'later' | 'move' | 'cantStart' | 'confirm' | 'undo' | 'didRest'

export interface BlockSheetModel {
  readonly item: ScheduledItem
  readonly actions: readonly BlockAction[]
  readonly microStart: MicroStart | null
}

const actionsFor = (
  item: ScheduledItem,
  profile: CalibrationProfile,
  today: number,
): readonly BlockAction[] => {
  // Rest is asked about rather than ticked off: §5.2's log wants to know whether it helped,
  // and "Done" on a nap answers a different question.
  if (item.protectedRest) return ['didRest']

  if (item.dayIndex < today) {
    return profile.confirmedItemIds.includes(item.id) ? ['undo'] : ['confirm']
  }

  // Fixed means classes, shifts and hard deadlines. The optimizer may not move them, so
  // offering Move here would be the interface promising something the model refuses.
  if (item.fixed) return ['done']

  return ['done', 'later', 'move', 'cantStart']
}

export function blockSheet({
  schedule,
  profile,
  itemId,
  today,
}: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly itemId: string
  readonly today: number
}): BlockSheetModel | null {
  const item = schedule.items.find((candidate) => candidate.id === itemId)
  // A stale id closes the sheet rather than throwing. It happens for real: complete a block
  // and the id in the open view no longer exists.
  if (item === undefined) return null

  // How long it has been *waiting*, not how long until it is due. `dayIndex - today` is the
  // wait ahead of a task, and using it reported a fortnight-out errand as sixteen days
  // overdue -- the same bug roomModel already had to fix.
  const daysWaiting = Math.max(0, today - item.dayIndex)

  return {
    item,
    actions: actionsFor(item, profile, today),
    microStart: isStuck(item, 0, daysWaiting) ? firstAction(item) : null,
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/week/blockActions.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/blockActions.ts src/ui/week/blockActions.test.ts
git commit -m "feat: derive a block's actions from the block"
```

---

## Task 8: `BlockSheet`

**Files:**
- Create: `src/ui/week/BlockSheet.tsx`, `src/ui/week/BlockSheet.test.tsx`

**Interfaces:**
- Consumes: `blockSheet`, `BlockAction` (Task 7); `Sheet`, `Button`, `Card` (Tasks 2–3); `ANSWER_FACTOR`, `BlockAnswer` (Task 9 — **write Task 9 first if implementing out of order**, or inline the four-way type here and have Task 9 import it)
- Produces:

```ts
export function BlockSheet(props: {
  readonly model: BlockSheetModel
  readonly onClose: () => void
  readonly onDone: (itemId: string) => void
  readonly onLater: (itemId: string) => void
  readonly onMove: (itemId: string) => void
  readonly onConfirm: (itemId: string, answer: BlockAnswer) => void
  readonly onUndo: (itemId: string) => void
  readonly onRested: (itemId: string, rested: boolean) => void
}): JSX.Element
```

> **Ordering note:** `BlockAnswer` and `ANSWER_FACTOR` are defined in Task 9's `todayCard.ts`. Implement Task 9 before this one, or create `src/ui/today/todayCard.ts` with just those two exports first and let Task 9 fill in the rest.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BlockSheetModel } from './blockActions'
import { BlockSheet } from './BlockSheet'

const model = (over: Partial<BlockSheetModel> = {}): BlockSheetModel => ({
  item: {
    id: 'essay',
    title: 'Essay draft',
    type: 'mental',
    kind: 'studyBlock',
    hours: 3,
    intensity: 1,
    dayIndex: 5,
    startHour: 20,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  },
  actions: ['done', 'later', 'move', 'cantStart'],
  microStart: null,
  ...over,
})

const setup = (over: Partial<BlockSheetModel> = {}) => {
  const handlers = {
    onClose: vi.fn(),
    onDone: vi.fn(),
    onLater: vi.fn(),
    onMove: vi.fn(),
    onConfirm: vi.fn(),
    onUndo: vi.fn(),
    onRested: vi.fn(),
  }
  render(<BlockSheet model={model(over)} {...handlers} />)
  return handlers
}

describe('BlockSheet', () => {
  it('is named by the block', () => {
    setup()

    expect(screen.getByRole('dialog')).toHaveAccessibleName('Essay draft')
  })

  it('says when the block is and how long it runs', () => {
    setup()

    expect(screen.getByTestId('block-when')).toHaveTextContent('20:00')
    expect(screen.getByTestId('block-when')).toHaveTextContent('3')
  })

  it('completes the block', async () => {
    const { onDone } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onDone).toHaveBeenCalledWith('essay')
  })

  it('offers nothing it was not given', () => {
    setup({ actions: ['done'] })

    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('asks a past block how it went, in one four-way answer', async () => {
    const { onConfirm } = setup({ actions: ['confirm'] })

    await userEvent.click(screen.getByTestId('answer-longer'))

    expect(onConfirm).toHaveBeenCalledWith('essay', 'longer')
  })

  it('asks protected rest whether it happened', async () => {
    const { onRested } = setup({ actions: ['didRest'], item: { ...model().item, protectedRest: true } })

    await userEvent.click(screen.getByTestId('rested-no'))

    expect(onRested).toHaveBeenCalledWith('essay', false)
  })

  it('shows the micro-start unasked when one is offered', () => {
    setup({ microStart: { itemId: 'essay', action: 'Open the document and write the title.', minutes: 8 } })

    expect(screen.getByTestId('micro-start')).toHaveTextContent('Open the document')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/week/BlockSheet.test.tsx`
Expected: FAIL — cannot resolve `./BlockSheet`.

- [ ] **Step 3: Implement**

Build it from `Sheet`. Requirements beyond the tests:

- `title` is the item's title; the body holds `<p data-testid="block-when">` reading `20:00–23:00 · study and writing · 3 hours`, using the same student-facing words `realityCheck.ts` uses (`mental` → "study and writing", `physical` → "physical things", `social` → "seeing people", `errands` → "life admin").
- Micro-start renders as `<Card tone="calm" data-testid="micro-start">` above the actions, carrying the action sentence and `8 minutes. That is the whole ask.`
- `confirm` renders four `Button`s in the action bar with `data-testid={`answer-${answer}`}`, labelled **Didn't happen · Took less · About right · Took longer**.
- `didRest` renders two, `data-testid="rested-yes"` / `rested-no`, labelled **I rested · I didn't**.
- `cantStart` is a `quiet` Button labelled **I can't start this** which reveals the micro-start when one is not already shown — §4.1's manual trigger.
- Everything else goes in the action bar as `primary` (first) then `secondary`.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/week/BlockSheet.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/week/BlockSheet.tsx src/ui/week/BlockSheet.test.tsx
git commit -m "feat: add the block sheet"
```

---

## Task 8b: The block log

§8b. A durable per-day record of what was scheduled and what became of it. Nothing renders it.
Three defects share one missing piece — a record both writers can reach and something can read —
and this is that piece. **Do it before Task 9**, which writes to it.

**Files:**
- Create: `src/domain/blockLog.ts`, `src/domain/blockLog.test.ts`
- Create: `supabase/migrations/0005_block_log.sql`
- Modify: `src/data/types.ts` — `Repository` gains two methods
- Modify: `src/data/localRepository.ts`, `src/data/supabaseRepository.ts`
- Modify: `src/data/repositoryContract.ts` — the shared suite both adapters must pass
- Modify: `src/data/fallbackRepository.ts`

**Interfaces:**
- Produces:

```ts
export type BlockAnswer = 'didnt' | 'less' | 'right' | 'longer'
export const ANSWER_FACTOR: Record<BlockAnswer, number>

export interface BlockRecord {
  readonly blockId: string
  readonly type: LoadType
  readonly plannedHours: number
  readonly dayIndex: number
  readonly answer: BlockAnswer
  readonly answeredAt: number
}

export function outcomesFrom(log: readonly BlockRecord[]): readonly BlockOutcome[]
export function answeredIds(log: readonly BlockRecord[]): readonly string[]
export function checkedInDays(
  log: readonly BlockRecord[],
  today: number,
  horizonDays: number,
): readonly boolean[]

// Repository
loadBlockLog(): Promise<readonly BlockRecord[]>
recordBlockAnswer(record: BlockRecord): Promise<void>
```

> `ANSWER_FACTOR` and `BlockAnswer` move here from Task 9's `todayCard.ts` — this is now their
> home, and `todayCard.ts` imports them. Task 8's ordering note is satisfied by this task.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ANSWER_FACTOR, answeredIds, checkedInDays, outcomesFrom, type BlockRecord } from './blockLog'

const record = (over: Partial<BlockRecord> = {}): BlockRecord => ({
  blockId: 'essay',
  type: 'mental',
  plannedHours: 3,
  dayIndex: 2,
  answer: 'right',
  answeredAt: 1_757_000_000_000,
  ...over,
})

describe('outcomesFrom', () => {
  it('turns each answer into planned hours times its factor', () => {
    const log = [
      record({ blockId: 'a', answer: 'didnt' }),
      record({ blockId: 'b', answer: 'longer' }),
    ]

    expect(outcomesFrom(log).map((outcome) => outcome.actualHours)).toEqual([
      0,
      3 * ANSWER_FACTOR.longer,
    ])
  })

  it('keeps what was planned, which is half of what Reality Check compares', () => {
    expect(outcomesFrom([record()])[0]).toEqual({
      type: 'mental',
      plannedHours: 3,
      actualHours: 3,
    })
  })
})

describe('answeredIds', () => {
  it('lists every block already asked about, so none is asked twice', () => {
    expect(answeredIds([record({ blockId: 'a' }), record({ blockId: 'b' })])).toEqual(['a', 'b'])
  })
})

describe('checkedInDays', () => {
  it('counts a past day with an answer as checked in', () => {
    expect(checkedInDays([record({ dayIndex: 1 })], 3, 5)[1]).toBe(true)
  })

  it('counts a past day with no answer as silence, which is what §6.5 wants to see', () => {
    expect(checkedInDays([record({ dayIndex: 1 })], 3, 5)[2]).toBe(false)
  })

  it('treats every day still ahead as checked in', () => {
    // The trap: a future day has nothing to check in about. Marking the horizon as missed
    // compounds to 1 + 0.08 x 21 = 2.68x pessimism on every projection, permanently.
    const days = checkedInDays([], 3, 21)

    expect(days.slice(4).every(Boolean)).toBe(true)
  })

  it('treats today as checked in until the day is over', () => {
    expect(checkedInDays([], 3, 5)[3]).toBe(true)
  })

  it('returns one entry per day of the horizon', () => {
    expect(checkedInDays([], 3, 21)).toHaveLength(21)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/blockLog.test.ts`
Expected: FAIL — cannot resolve `./blockLog`.

- [ ] **Step 3: Implement the pure module**

```ts
import type { BlockOutcome } from './calibration'
import type { LoadType } from '../engine'

/**
 * §8b: what was scheduled, and what became of it.
 *
 * Written by the today card and by the Telegram bot; read by `paramsFor` and by
 * `toDayInputs`; rendered by nothing. It exists because three separate defects shared one
 * missing piece -- a durable record of block outcomes that both writers could reach and
 * something could actually read.
 *
 * The record carries `type` and `plannedHours` itself rather than looking them up, because a
 * week is persisted as one jsonb blob and there are no rows for `blockId` to join against.
 * That is precisely why the existing `block_answers` table can be read by nothing: it stores
 * the answer alone, which is not enough to compute an outcome.
 */
export type BlockAnswer = 'didnt' | 'less' | 'right' | 'longer'

/**
 * One four-way answer replaces `yes/partly/no` x `harder/same/easier`.
 *
 * Those were two different questions multiplied together as though they were one axis:
 * completion and duration. Reality Check consumes only duration. The commonest study
 * outcome -- three hours sat down, half the essay done -- recorded as `partly` and told the
 * app the student works less than they do. It is `longer`: the essay is bigger than three
 * hours.
 */
export const ANSWER_FACTOR: Record<BlockAnswer, number> = {
  didnt: 0,
  less: 0.75,
  right: 1,
  longer: 1.5,
}

export interface BlockRecord {
  readonly blockId: string
  readonly type: LoadType
  readonly plannedHours: number
  readonly dayIndex: number
  readonly answer: BlockAnswer
  readonly answeredAt: number
}

export function outcomesFrom(log: readonly BlockRecord[]): readonly BlockOutcome[] {
  return log.map((entry) => ({
    type: entry.type,
    plannedHours: entry.plannedHours,
    actualHours: Math.round(entry.plannedHours * ANSWER_FACTOR[entry.answer] * 100) / 100,
  }))
}

export function answeredIds(log: readonly BlockRecord[]): readonly string[] {
  return log.map((entry) => entry.blockId)
}

/**
 * §6.5's signal, at last.
 *
 * A past day carrying no answer is a day the student went quiet, and non-check-in
 * correlates with bad weeks -- so a model that gets more worried is behaving correctly.
 *
 * Days still ahead are `true`, and that is not a convenience. A future day has nothing to
 * check in about; marking the horizon as missed compounds to 1 + 0.08 x 21 = 2.68x
 * pessimism on every projection, permanently, which is catastrophically wrong rather than
 * appropriately cautious. Today counts as checked in too: the day is not over.
 */
export function checkedInDays(
  log: readonly BlockRecord[],
  today: number,
  horizonDays: number,
): readonly boolean[] {
  const answered = new Set(log.map((entry) => entry.dayIndex))

  return Array.from({ length: horizonDays }, (_, day) => day >= today || answered.has(day))
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/domain/blockLog.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Extend the repository contract**

Add to `src/data/repositoryContract.ts`, inside `describeRepositoryContract` so **both** adapters
must satisfy it:

```ts
it('starts with an empty block log', async () => {
  expect(await repo.loadBlockLog()).toEqual([])
})

it('reads back what it recorded', async () => {
  await repo.recordBlockAnswer(record())

  expect(await repo.loadBlockLog()).toHaveLength(1)
})

it('corrects a repeated answer rather than stacking a second one', async () => {
  await repo.recordBlockAnswer(record({ answer: 'right' }))
  await repo.recordBlockAnswer(record({ answer: 'longer' }))

  const log = await repo.loadBlockLog()
  expect(log).toHaveLength(1)
  expect(log[0]?.answer).toBe('longer')
})

it('forgets the log on clear, like everything else', async () => {
  await repo.recordBlockAnswer(record())
  await repo.clear()

  expect(await repo.loadBlockLog()).toEqual([])
})
```

- [ ] **Step 6: Implement both adapters and the fallback**

`localRepository` stores the log under its own IndexedDB key, upserting on `blockId`.
`supabaseRepository` reads and writes `block_answers`, mapping snake_case columns to the record.
`fallbackRepository` delegates exactly as it does for weeks.

**The signed-out path is the reason this sits behind the repository at all.** Putting the log in
Supabase alone would silently stop Reality Check working for anyone without an account, which is
a supported way to use this app.

- [ ] **Step 7: Write migration 0005**

```sql
-- §8b: make block_answers readable, and make it carry enough to compute an outcome.
--
-- NOT APPLIED AUTOMATICALLY. Apply it the way 0002, 0003 and 0004 were applied.
--
-- 0004 stored an answer and nothing else, which is why nothing could read it: a week lives
-- in a jsonb column, so `block_id` has nothing to join against and the type and planned
-- hours Reality Check compares were nowhere to be found.

alter table public.block_answers
  add column if not exists load_type text,
  add column if not exists planned_hours numeric,
  add column if not exists day_index integer;

-- 0004 allowed yes/no/partly, which answers "did you do it". Reality Check asks "how long
-- did it take", and the two were being multiplied together as though they were one axis.
-- Existing rows stay valid and keep their old meaning; nothing reads them yet, so there is
-- nothing to migrate.
alter table public.block_answers
  drop constraint if exists block_answers_answer_check;

alter table public.block_answers
  add constraint block_answers_answer_check
  check (answer in ('yes', 'no', 'partly', 'didnt', 'less', 'right', 'longer'));

-- 0004 enabled RLS with no policies at all, on the reasoning that nothing read the table
-- and granting access would widen the surface for nothing. Something reads it now, so it
-- gets the same auth.uid() policies 0002 established for user_state.
create policy "read own answers"
  on public.block_answers for select
  using (auth.uid() = account_id);

create policy "insert own answers"
  on public.block_answers for insert
  with check (auth.uid() = account_id);

create policy "update own answers"
  on public.block_answers for update
  using (auth.uid() = account_id)
  with check (auth.uid() = account_id);
```

- [ ] **Step 8: Point `paramsFor` and `toDayInputs` at the log**

`paramsFor(profile)` becomes `paramsFor(outcomes: readonly BlockOutcome[])` — every caller
already has the log in hand or can be passed it. `toDayInputs(schedule)` gains an optional
second argument `checkedIn?: readonly boolean[]`, defaulting to all-true so the optimizer's
thousands of internal calls are unchanged and only the app's own projection passes real data.

Add a test asserting a silent past day makes the projection more pessimistic than the same
week with that day answered.

- [ ] **Step 9: Run everything**

Run: `npm test && npm run typecheck`

- [ ] **Step 10: Commit**

```bash
git add src/domain/blockLog.ts src/domain/blockLog.test.ts src/data supabase/migrations/0005_block_log.sql src/domain/engineParams.ts src/optimizer/objective.ts
git commit -m "feat: record what became of each block, and let three dead mechanisms read it"
```

---

## Task 9: `todayCard` — which block to ask about, and what the answers mean

§8. Pure.

**Files:**
- Create: `src/ui/today/todayCard.ts`, `src/ui/today/todayCard.test.ts`

**Interfaces:**
- Produces:

> **Changed by Task 8b:** `BlockAnswer` and `ANSWER_FACTOR` now live in `src/domain/blockLog.ts`
> and are imported here, not redefined. `outcomeFor` is likewise replaced by `outcomesFrom` in
> that module — drop it from this task. `blockToAsk` takes the log's `answeredIds` instead of
> `profile.confirmedItemIds`, which no longer exists.

```ts
export type SleepBucket = 'under5' | 'six' | 'seven' | 'eightPlus'
export const SLEEP_HOURS: Record<SleepBucket, number>

export function blockToAsk(input: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly today: number
}): ScheduledItem | null

export function outcomeFor(item: ScheduledItem, answer: BlockAnswer): BlockOutcome
export function withSleep(schedule: Schedule, dayIndex: number, bucket: SleepBucket): Schedule
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '../../domain/calibration'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { ANSWER_FACTOR, blockToAsk, outcomeFor, SLEEP_HOURS, withSleep } from './todayCard'

const item = (id: string, type: ScheduledItem['type'], dayIndex = 0): ScheduledItem => ({
  id,
  title: id,
  type,
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
})

const week = (items: ScheduledItem[]): Schedule => ({
  items,
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describe('blockToAsk', () => {
  it('asks nothing when there is nothing unconfirmed', () => {
    const profile = { ...DEFAULT_PROFILE, confirmedItemIds: ['a'] }

    expect(blockToAsk({ schedule: week([item('a', 'mental')]), profile, today: 0 })).toBeNull()
  })

  it('never asks about a day that has not happened', () => {
    const schedule = week([item('future', 'mental', 6)])

    expect(blockToAsk({ schedule, profile: DEFAULT_PROFILE, today: 0 })).toBeNull()
  })

  it('asks about the load type it knows least about, so the threshold is reached fastest', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      confirmations: [
        { type: 'mental' as const, plannedHours: 2, actualHours: 2 },
        { type: 'mental' as const, plannedHours: 2, actualHours: 2 },
      ],
    }
    const schedule = week([item('study', 'mental'), item('gym', 'physical')])

    expect(blockToAsk({ schedule, profile, today: 0 })?.id).toBe('gym')
  })

  it('breaks ties by the earlier block, so the day is walked as it was lived', () => {
    const early = { ...item('early', 'mental'), startHour: 8 }
    const late = { ...item('late', 'mental'), startHour: 20 }

    expect(blockToAsk({ schedule: week([late, early]), profile: DEFAULT_PROFILE, today: 0 })?.id)
      .toBe('early')
  })
})

describe('outcomeFor', () => {
  it('turns each answer into planned hours times its factor', () => {
    const essay = item('essay', 'mental')

    expect(outcomeFor(essay, 'didnt').actualHours).toBe(0)
    expect(outcomeFor(essay, 'right').actualHours).toBe(2)
    expect(outcomeFor(essay, 'longer').actualHours).toBe(2 * ANSWER_FACTOR.longer)
  })

  it('records what was planned, not only what happened', () => {
    expect(outcomeFor(item('essay', 'mental'), 'less').plannedHours).toBe(2)
  })
})

describe('withSleep', () => {
  it('writes the reported night into the day it was about', () => {
    const next = withSleep(week([]), 3, 'under5')

    expect(next.sleepByDay[3]).toBe(SLEEP_HOURS.under5)
  })

  it('leaves every other night alone, and does not mutate the week it was given', () => {
    const before = week([])
    const next = withSleep(before, 3, 'under5')

    expect(next.sleepByDay[4]).toBe(7)
    expect(before.sleepByDay[3]).toBe(7)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/today/todayCard.test.ts`
Expected: FAIL — cannot resolve `./todayCard`.

- [ ] **Step 3: Implement**

```ts
import type { BlockOutcome, CalibrationProfile } from '../../domain/calibration'
import type { Schedule, ScheduledItem } from '../../optimizer'

/**
 * §8: one card, three taps, once a day.
 *
 * The old version asked *did it happen* and *was it harder* about **every** block. Four
 * blocks was eight taps, which is why it would never have happened -- and the accuracy
 * number it feeds would have read "not enough data" forever.
 */

export type SleepBucket = 'under5' | 'six' | 'seven' | 'eightPlus'

/** Buckets, not a typed number (§7.5): nobody reports their night to the half hour, and
 *  asking for one collects a figure that means nothing. */
export const SLEEP_HOURS: Record<SleepBucket, number> = {
  under5: 4.5,
  six: 6,
  seven: 7,
  eightPlus: 8.5,
}

export type BlockAnswer = 'didnt' | 'less' | 'right' | 'longer'

/**
 * One four-way answer replaces the old yes/partly/no × harder/same/easier grid.
 *
 * The only case lost is "it happened but only partly", which was the least useful of the
 * nine and the hardest to answer honestly.
 */
export const ANSWER_FACTOR: Record<BlockAnswer, number> = {
  didnt: 0,
  less: 0.75,
  right: 1,
  longer: 1.5,
}

export function outcomeFor(item: ScheduledItem, answer: BlockAnswer): BlockOutcome {
  return {
    type: item.type,
    plannedHours: item.hours,
    actualHours: Math.round(item.hours * ANSWER_FACTOR[answer] * 100) / 100,
  }
}

/**
 * The unconfirmed block whose load type the app knows least about.
 *
 * Asking once a day would otherwise take a fortnight to clear `MIN_SAMPLES` for all four
 * types. Choosing the least-sampled one fills the gaps first, so §2.4's correction starts
 * working as early as asking once a day allows.
 */
export function blockToAsk({
  schedule,
  profile,
  today,
}: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly today: number
}): ScheduledItem | null {
  const samples = (item: ScheduledItem): number =>
    profile.confirmations.filter((outcome) => outcome.type === item.type).length

  const candidates = schedule.items
    .filter((item) => item.dayIndex <= today && !profile.confirmedItemIds.includes(item.id))
    .slice()
    .sort(
      (left, right) =>
        samples(left) - samples(right) ||
        left.dayIndex - right.dayIndex ||
        left.startHour - right.startHour,
    )

  return candidates[0] ?? null
}

/** Writes the reported night into the week. Nothing has ever written `sleepByDay` after the
 *  week was created, which is why the plant and the bed have been reporting a constant. */
export function withSleep(schedule: Schedule, dayIndex: number, bucket: SleepBucket): Schedule {
  return {
    ...schedule,
    sleepByDay: schedule.sleepByDay.map((hours, index) =>
      index === dayIndex ? SLEEP_HOURS[bucket] : hours,
    ),
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/today/todayCard.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/today/todayCard.ts src/ui/today/todayCard.test.ts
git commit -m "feat: pick one block a day and give sleep a way in"
```

---

## Task 10: `TodayCard`

§8. Energy, sleep, one block. Three taps.

**Files:**
- Create: `src/ui/today/TodayCard.tsx`, `src/ui/today/TodayCard.test.tsx`
- Delete: `src/ui/validation/EnergyCheckIn.tsx`, `src/ui/validation/EnergyCheckIn.test.tsx`

**Interfaces:**
- Consumes: `blockToAsk`, `SleepBucket`, `BlockAnswer` (Task 9); `Card`, `Button` (Task 2)
- Produces:

```ts
export function TodayCard(props: {
  readonly block: ScheduledItem | null
  readonly askEnergy: boolean
  readonly askSleep: boolean
  readonly onEnergy: (energy: number) => void
  readonly onSleep: (bucket: SleepBucket) => void
  readonly onBlock: (itemId: string, answer: BlockAnswer) => void
  readonly onDismiss: () => void
}): JSX.Element | null
```

Returns `null` when all three rows are answered — the card disappears rather than showing an empty shell.

- [ ] **Step 1: Write the failing test**

Cover: the five energy bands report their value; the four sleep buckets report theirs; the block row names the block and its planned hours and reports the answer; a row already answered is not rendered; nothing to ask returns null; the copy never scolds.

Reuse `EnergyCheckIn.test.tsx`'s band values (`10 · 30 · 50 · 70 · 90`) — those are §8.1's and must not change.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/today/TodayCard.test.tsx`
Expected: FAIL — cannot resolve `./TodayCard`.

- [ ] **Step 3: Implement**

Built from `Card`, with three `<fieldset>` rows separated by hairlines. Band labels are §8.1's exactly: **Running on empty · Low · Getting by · Pretty good · Full of it**, `data-testid={`energy-${value}`}`. Sleep labels: **Under 5 · 6 · 7 · 8+**, `data-testid={`sleep-${bucket}`}`. Block row reads `Essay draft — you planned 3h` with the four answers from Task 8's labels, `data-testid={`answer-${answer}`}`.

A `quiet` **Not now** dismisses. §7.9's rule holds: a prompt nobody can escape is one they learn to dread.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/today/TodayCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Delete `EnergyCheckIn`**

```bash
git rm src/ui/validation/EnergyCheckIn.tsx src/ui/validation/EnergyCheckIn.test.tsx
```

`RoomShell` still imports it at this point and will not typecheck. That is expected and Task 13 fixes it — but if you prefer a green tree at every commit, defer the `git rm` to Task 13.

- [ ] **Step 6: Commit**

```bash
git add src/ui/today/
git commit -m "feat: ask about energy, sleep and one block in one card"
```

---

## Task 11: `cardPrecedence`

§3. Four things can want the screen at once. Showing them together hands a menu to a depleted person, which is the exact thing §7 deletes `outings.ts` for doing.

**Files:**
- Create: `src/ui/room/cardPrecedence.ts`, `src/ui/room/cardPrecedence.test.ts`

**Interfaces:**
- Produces:

```ts
export type CardId = 'recovery' | 'lapsed' | 'stuck' | 'today'

export function visibleCards(input: {
  readonly recovery: boolean
  readonly lapsed: boolean
  readonly stuck: boolean
  readonly today: boolean
  readonly lowEnergy: boolean
}): readonly CardId[]
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { visibleCards } from './cardPrecedence'

const all = { recovery: true, lapsed: true, stuck: true, today: true, lowEnergy: false }

describe('visibleCards', () => {
  it('shows nothing when nothing applies', () => {
    expect(visibleCards({ ...all, recovery: false, lapsed: false, stuck: false, today: false }))
      .toEqual([])
  })

  it('caps at two, in order, when the student is not flattened', () => {
    expect(visibleCards(all)).toEqual(['recovery', 'lapsed'])
  })

  it('shows exactly one below the low-energy threshold', () => {
    expect(visibleCards({ ...all, lowEnergy: true })).toEqual(['recovery'])
  })

  it('leads with recovery, because it addresses why the others are hard', () => {
    expect(visibleCards({ ...all, recovery: true, lapsed: true })[0]).toBe('recovery')
  })

  it('puts the day s question last, because it asks rather than offers', () => {
    expect(visibleCards({ ...all, recovery: false, lapsed: false })).toEqual(['stuck', 'today'])
  })

  it('skips what does not apply rather than leaving a gap', () => {
    expect(visibleCards({ ...all, recovery: false, stuck: false })).toEqual(['lapsed', 'today'])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/room/cardPrecedence.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/**
 * §3: which live cards the room screen shows, and how many.
 *
 * Recovery leads because it is the only one that addresses *why* the others are hard.
 * "How did today go?" is last because it asks the student for something rather than
 * offering them anything, and a depleted person should meet an offer before a request.
 */
export type CardId = 'recovery' | 'lapsed' | 'stuck' | 'today'

const ORDER: readonly CardId[] = ['recovery', 'lapsed', 'stuck', 'today']

/** §1.5: a student at 12% reserve should not be handed a dashboard, and two cards is a
 *  small dashboard. */
const CAP_LOW_ENERGY = 1
const CAP_NORMAL = 2

export function visibleCards(applies: {
  readonly recovery: boolean
  readonly lapsed: boolean
  readonly stuck: boolean
  readonly today: boolean
  readonly lowEnergy: boolean
}): readonly CardId[] {
  return ORDER.filter((id) => applies[id]).slice(
    0,
    applies.lowEnergy ? CAP_LOW_ENERGY : CAP_NORMAL,
  )
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/ui/room/cardPrecedence.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/cardPrecedence.ts src/ui/room/cardPrecedence.test.ts
git commit -m "feat: order the room's live cards and cap how many show at once"
```

---

## Task 12: Room goes display-only, gauge moves in, paragraph capped

§3. Twelve invisible tap targets and `hotspots.ts` go. The dial stops being two taps deep.

**Files:**
- Modify: `src/ui/room/Room.tsx` — drop `onSelect`, `pulsing`, and the `model.rows.map` button block
- Modify: `src/ui/room/Room.test.tsx`, `src/ui/room/Room.keyboard.test.tsx`
- Modify: `src/ui/room/roomText.ts`, `src/ui/room/roomText.test.ts` — cap at three sentences
- Delete: `src/ui/room/hotspots.ts`
- Delete: `src/ui/room/ObjectDetail.tsx`, `ObjectDetail.test.tsx` (unreachable once nothing zooms an object)

- [ ] **Step 1: Write the failing tests**

In `Room.test.tsx`, replace the hotspot assertions with:

```tsx
it('is a picture, not a control surface', () => {
  render(<Room model={modelOf()} />)

  expect(screen.queryAllByRole('button')).toHaveLength(0)
})

it('shows the reserve without anybody having to look for it', () => {
  render(<Room model={modelOf()} />)

  expect(screen.getByTestId('room-gauge')).toBeInTheDocument()
})
```

In `roomText.test.ts`, add:

```ts
it('never runs past three sentences, so 320px keeps its buttons', () => {
  // Everything at once: flattened, storm, clutter, sleep debt, drooping plant, lit door.
  const loud = describeRoom(worstCaseState())

  expect(loud.split('. ').length).toBeLessThanOrEqual(3)
})

it('always keeps the two things the picture cannot say another way', () => {
  const loud = describeRoom(worstCaseState())

  expect(loud).toMatch(/flattened/i)
  expect(loud).toMatch(/storm/i)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/room`
Expected: FAIL — buttons still present, paragraph still six sentences.

- [ ] **Step 3: Strip `Room` and cap `describeRoom`**

`Room.tsx`: delete the `model.rows.map(...)` block at the end and the `onSelect` / `pulsing` props. Keep the SVG exactly as it is — all nine bindings stay. Add the gauge as an absolutely-positioned overlay in the top-right, rendering the reserve percentage; it is **not** a button.

`roomText.ts`: keep character and weather always. Then append at most one more, in this order: door lit, sleep debt, clutter, plant. The full uncapped text moves to a new export `describeRoomFully(state)` used for the drawing's `aria-label`, so screen-reader users lose nothing — the cap is visual only.

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/ui/room`
Expected: `Room.keyboard.test.tsx` now tests nothing real — delete it, since the drawing has no keyboard surface left.

- [ ] **Step 5: Commit**

```bash
git add src/ui/room/Room.tsx src/ui/room/Room.test.tsx src/ui/room/roomText.ts src/ui/room/roomText.test.ts
git rm src/ui/room/hotspots.ts src/ui/room/Room.keyboard.test.tsx src/ui/room/ObjectDetail.tsx src/ui/room/ObjectDetail.test.tsx
git commit -m "feat: make the room a picture and put the gauge in it"
```

---

## Task 13: `RoomShell` becomes the room screen and the router

§3. The 507-line switchboard becomes routing and data.

**Files:**
- Modify: `src/ui/room/RoomShell.tsx` — target under 200 lines
- Modify: `src/ui/room/view.ts`, `view.test.ts`
- Modify: every `src/ui/RoomShell.*.test.tsx` — move assertions down to the component that now owns each

**Interfaces:**
- Produces:

```ts
export type View =
  | { readonly kind: 'room' }
  | { readonly kind: 'week' }
  | { readonly kind: 'block'; readonly itemId: string }
  | { readonly kind: 'add' }
  | { readonly kind: 'settings' }
```

- [ ] **Step 1: Rewrite `view.ts` and its test**

Replace `zoomTo` / `toWords` with `toWeek()`, `toBlock(itemId)`, `toAdd()`, `toSettings()`, and keep `back()` returning `ROOM`. Exception: `back()` from a `block` returns `{ kind: 'week' }`, because closing a block should leave you where you opened it — the one place a stack is worth having. Test that.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/room/view.test.ts`

- [ ] **Step 3: Rewrite `RoomShell`**

It keeps: `useSchedule`, `useProfile`, the anchoring and prediction `useEffect`, `onRebalance`, the loading sentence, and the `PreviewBanner`. It loses `contentFor` entirely.

The room screen is: `<h1>`, `PreviewBanner`, `<Room>`, `describeRoom` paragraph, `<AccuracyNote>`, the live cards from `visibleCards`, then `The week` and `+`. Below the low-energy threshold: drop the week link, trim the paragraph, show one card.

Routing: `week` → `WeekScreen`; `block` → `BlockSheet` fed by `blockSheet(...)`, closing to `week`; `add` → `AddSheet` (Task 14 — stub it as a `Sheet` with the three buttons wired to the existing screens until then); `settings` → account and Telegram.

- [ ] **Step 4: Run the whole suite and fix the fallout**

Run: `npm test`

The eight `RoomShell.*.test.tsx` files assert against objects that no longer exist. **Move each assertion to the component that now owns it** rather than deleting it — `RoomShell.planner.test.tsx`'s parsing assertions belong to `AddSheet`, `RoomShell.microStart.test.tsx`'s to `BlockSheet`, `RoomShell.prediction.test.tsx`'s to `TodayCard`. `RoomShell.test.tsx` keeps routing only.

- [ ] **Step 5: Check coverage has not dropped**

Run: `npm run test:coverage`
Expected: at or above 97 / 91 / 97 / 98. If below, the missing tests are real — write them.

- [ ] **Step 6: Commit**

```bash
git add -A src/ui
git commit -m "feat: make RoomShell a router and the room screen"
```

---

> ## ← STOP AND DEMO FROM HERE
>
> Room, week, blocks, today card and rebalance all work, and everything on screen is on the
> design system. Four of the five pitch beats are reachable; only the request box still wears
> its old styling. Run `npm run dev` and walk §12's five beats before going on.

---

# Phase 2 — after the demo line

> **Phase 2 tasks are specified more tersely than Phase 1's on purpose.** Every one of them
> either rewires code that already exists and is already tested (Tasks 14, 17) or changes a
> pure function whose test file is already in the repo and shows the house style (Tasks 15,
> 16). Phase 1's tasks all created something from nothing, which is where a plan has to carry
> the full code. Before starting any Phase 2 task, **read the existing test file it modifies**
> — it is the specification for the style and coverage expected.

## Task 14a: The parse carries `kind`

§6, "How a typed event becomes numbers". Do this **before** Task 14 — it changes the data those
screens carry.

Today the parse produces `{title, type, hours, deadlineDay, hard}` and `addItems` invents a kind
from a four-row table. That makes `hardExercise`, `socialRestorative`, `rest` and `sleep`
unreachable from any text, and it makes the engine believe a two-hour gym session **improves**
the next study block (`lightExercise` is `mental +0.10`; `hardExercise` is `−0.25`).

**Files:**
- Modify: `src/ai/types.ts` — `ParsedItem` gains `kind: ActivityKind`
- Modify: `src/ai/schema.ts`, `schema.test.ts` — `replySchema` gains `kind`
- Modify: `src/ai/groq.ts`, `groq.test.ts` — the prompt asks for it
- Modify: `src/ai/fallbackParser.ts`, `fallbackParser.test.ts` — derive kind from the signal words
- Modify: `src/domain/addItems.ts`, `addItems.test.ts` — read `item.kind`, delete `KIND_FOR`
- Modify: `src/ui/planner/ItemChip.tsx`, `ItemChip.test.tsx` — let a student correct the kind

**Interfaces:**
- Produces: `ParsedItem.kind: ActivityKind`. Every producer of a `ParsedItem` must set it —
  `parseModelReply`, `parseWithRules`, and every test fixture that builds one by hand.

- [ ] **Step 1: Write the failing tests**

```ts
// src/ai/fallbackParser.test.ts
it('tells hard training from a walk, using signal words it already has', () => {
  expect(parseWithRules('gym')[0]?.kind).toBe('hardExercise')
  expect(parseWithRules('walk')[0]?.kind).toBe('lightExercise')
})

it('lets a student type rest and get rest, rather than a study block', () => {
  const [nap] = parseWithRules('nap for an hour')

  expect(nap?.kind).toBe('rest')
})

it('defaults unrecognised physical work to the dearer kind', () => {
  // addItems' own doctrine: crediting recovery that never happened reports a student as
  // fine while they sink; under-crediting only errs toward caution.
  expect(parseWithRules('badminton')[0]?.kind).toBe('hardExercise')
})

it('keeps social pessimistic, because a parse cannot tell a friend from a group project', () => {
  expect(parseWithRules('coffee with sarah')[0]?.kind).toBe('socialDraining')
})
```

```ts
// src/ai/schema.test.ts
it('rejects a kind the engine does not have', () => {
  const reply = {
    items: [{ title: 'gym', type: 'physical', kind: 'crossfit', hours: 2, deadlineDay: null, hard: false }],
  }

  expect(parseModelReply(reply)).toBeNull()
})

it('keeps a kind the engine does have', () => {
  const reply = {
    items: [{ title: 'gym', type: 'physical', kind: 'hardExercise', hours: 2, deadlineDay: null, hard: false }],
  }

  expect(parseModelReply(reply)?.[0]?.kind).toBe('hardExercise')
})
```

```ts
// src/domain/addItems.test.ts
it('carries the parsed kind through rather than deriving one from the type', () => {
  const week = addItems(emptyWeek(), [parsed({ type: 'physical', kind: 'hardExercise' })])

  expect(week.items[0]?.kind).toBe('hardExercise')
})

it('still refuses to let a parse pin anything, whatever kind it claims', () => {
  const week = addItems(emptyWeek(), [parsed({ type: 'mental', kind: 'rest' })])

  // Kind `rest` is not the protectedRest flag. §5.1's guarantee is that nothing from a
  // parse may be immovable -- a movable rest block is a different thing and is safe.
  expect(week.items[0]?.fixed).toBe(false)
  expect(week.items[0]?.protectedRest).toBe(false)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ai src/domain/addItems.test.ts`
Expected: FAIL — `kind` is not a property of `ParsedItem`.

- [ ] **Step 3: Add `kind` to the type and the schema**

`src/ai/types.ts`: add `readonly kind: ActivityKind` to `ParsedItem`, importing `ActivityKind`
from `../engine`.

`src/ai/schema.ts`: add to `replySchema`'s item object, using the engine's own union rather than
a copy that could drift:

```ts
kind: z.enum(ACTIVITY_KINDS),
```

`ACTIVITY_KINDS` does not exist yet — `src/engine/types.ts` declares `ActivityKind` as a bare
union. Add the runtime array beside it and derive the type from it, exactly as `LOAD_TYPES`
already does:

```ts
export const ACTIVITY_KINDS = [
  'hardExercise', 'lightExercise', 'studyBlock', 'socialDraining',
  'socialRestorative', 'errands', 'rest', 'sleep',
] as const

export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
```

Export it from `src/engine/index.ts`. Nothing else changes — the union's members are identical.

- [ ] **Step 4: Ask the model for it**

`src/ai/groq.ts`, add to `SYSTEM_PROMPT`:

```ts
'kind is one of: hardExercise, lightExercise, studyBlock, socialDraining, socialRestorative, errands, rest, sleep.',
'Choose kind by what the activity actually is, not by its type: a gym session is hardExercise, a walk is lightExercise, a nap is rest.',
'When unsure about physical work choose hardExercise, and for anything social choose socialDraining.',
```

The last line is the doctrine made explicit to the model: over-crediting recovery reports a
student as fine while they sink; under-crediting only errs toward caution.

- [ ] **Step 5: Derive kind in the rules fallback**

Split the existing `SIGNALS` physical row rather than adding a new list — the words are already
separated by hardness:

```ts
// hard:  gym · run · swim · football · training · exercise
// light: walk · yoga
```

Add a `rest` signal set (`nap`, `rest`, `break`, `downtime`) mapping to `type: 'mental'`,
`kind: 'rest'`. Defaults per type when no word matches: `mental→studyBlock`,
`physical→hardExercise`, `social→socialDraining`, `errands→errands`.

- [ ] **Step 6: Read the kind in `addItems`**

Delete `KIND_FOR` entirely and use `item.kind`. Leave `fixed: false` and `protectedRest: false`
and their comment untouched — that guarantee is unrelated to this change and must not move.

- [ ] **Step 7: Show it on the chip**

`ItemChip` already lets the type be corrected. Add the kind the same way, labelled in student
words rather than camelCase: **Hard exercise · Light exercise · Study · Seeing people (draining)
· Seeing people (restorative) · Life admin · Rest · Sleep**.

- [ ] **Step 8: Run everything**

Run: `npm test`
Expected: every hand-built `ParsedItem` fixture across the suite now fails to typecheck. Add
`kind` to each — do not widen the type to make them pass.

Run: `npm run typecheck`

- [ ] **Step 9: Commit**

```bash
git add src/ai src/engine src/domain/addItems.ts src/domain/addItems.test.ts src/ui/planner/ItemChip.tsx src/ui/planner/ItemChip.test.tsx
git commit -m "fix: let the parse say what an activity actually is"
```

---

## Task 14: `AddSheet`, and the three input screens on `kit/`

§6. Photo, text and request are the same shape — something arrives, you confirm what it is, it becomes blocks. The request path is the one that prices it first.

**Files:**
- Create: `src/ui/AddSheet.tsx`, `src/ui/AddSheet.test.tsx`
- Modify: `src/ui/planner/PlannerScreen.tsx`, `src/ui/planner/PhotoImportScreen.tsx`, `src/ui/request/RequestBoxScreen.tsx` — re-lay on `Field` and `Button`, move their buttons into `Sheet`'s action bar
- Modify: `src/ui/planner/ItemChip.tsx`

- [ ] **Step 1: Write the failing test** — three choices render; each reports which was chosen; Cancel closes.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement `AddSheet`** as a `Sheet` titled `What's coming at you?` with three large `secondary` Buttons and a `Cancel` in the action bar.
- [ ] **Step 4: Re-lay the three screens.** Behaviour must not change — do not touch the parsing, the confidence flagging, the two-room comparison, the three drafts, or the absence of a send button. There is a test asserting no send button; it must keep passing.
- [ ] **Step 5: Run the suite.** `npm test`
- [ ] **Step 6: Commit** — `feat: put the three input paths behind one control`

---

## Task 15: Simplify `prescribe`

§7. Two of these are defects, not simplifications.

**Files:**
- Modify: `src/domain/prescribe.ts`, `src/domain/prescribe.test.ts`

**Interfaces:**
- Produces: `Prescription` gains nothing; `prescribe` changes behaviour only. `freeGapOn` is replaced by `freeSlotOn(schedule, dayIndex): { startHour: number; hours: number } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('falls through when the emptiest reserve has no advice of its own', () => {
  // Errands lowest at 22, mental next at 25. Errands has no advice; mental does.
  const flat = week({ start: { mental: 25, physical: 70, social: 70, errands: 22 } })

  expect(prescribe(flat)?.kind).toBe('rest')
})

it('schedules into the gap it found rather than always at 16:00', () => {
  // 16:00 is taken, but the morning is free.
  const busyAfternoon = week({ items: [block({ startHour: 15, hours: 4 })] })

  expect(prescribe(busyAfternoon)?.startHour).not.toBe(16)
})

it('offers nothing when the day has no free hour', () => {
  expect(prescribe(week({ items: [block({ startHour: 0, hours: 24 })] }))).toBeNull()
})
```

- [ ] **Step 2: Run them and watch them fail.**

The first fails because `lowestOf` returns errands, `ADVICE['errands']` is undefined, and the function returns null — the emptiest reserve silently suppresses advice for the second-emptiest.

- [ ] **Step 3: Implement.** Sort the reserves ascending, take the first that is under 40 **and** has advice. Replace the gap arithmetic with a scan for the first free hour on day 0, returning where it is. One hour, fixed. 16:00 survives only as the tie-break for an empty day.
- [ ] **Step 4: Run them and watch them pass.**
- [ ] **Step 5: Commit** — `fix: stop errands suppressing advice, and schedule rest where the gap is`

---

## Task 16: The recovery card, and the end of the outings menu

§7.

**Files:**
- Create: `src/ui/recovery/RecoveryCard.tsx`, `RecoveryCard.test.tsx`
- Delete: `src/ui/recovery/DoorPanel.tsx`, `DoorPanel.test.tsx`, `src/ui/recovery/Prescription.tsx`, `Prescription.test.tsx`, `src/domain/outings.ts`, `outings.test.ts`, `src/domain/recoveryLog.ts`, `recoveryLog.test.ts`
- Modify: `src/optimizer/types.ts` — remove `Schedule.recoveryLog` and `RecoveryAttempt`
- Modify: `src/ui/room/roomModel.ts` — drop `prescribedOn`'s three-way routing

- [ ] **Step 1: Write the failing test** — one title, one sentence, exactly two buttons; accepting reports the prescription; "Not today" reports a dismissal and does **not** suppress the kind permanently.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement** from `Card tone="calm"`, keeping `Prescription`'s copy: *"About one hour. It is the thing that would help most right now."*
- [ ] **Step 4: Delete the log and the menu.** Dismissal becomes room-screen state keyed to the day, not a persisted attempt. Update `roomModel`, which no longer needs to decide whether a prescription belongs to the bed, the door or the phone.
- [ ] **Step 5: Run the suite.** Weeks with a persisted `recoveryLog` must still load — the field is ignored, not rejected. Add a test for that.
- [ ] **Step 6: Commit** — `feat: one recovery card, and no permanent suppression`

---

## Task 17: Delete calibration and shrink the profile

§10, §11.

**Files:**
- Delete: `src/ui/calibration/` (ModePicker, Painter, HowYouWork, CalibrationScreen, BlockConfirm, and their tests), `src/domain/painter.ts` + test, `src/ui/room/RoomSidebar.tsx` + test, `src/ui/LowEnergyView.tsx` + test
- Modify: `src/domain/calibration.ts` — profile keeps `confirmations`, `confirmedItemIds`, `predictions` only; delete `Mode`, `FocusBucket`, `focusMinutes`, `calibrationProgress`
- Modify: `src/domain/engineParams.ts` — `paramsFor` reads confirmations only; `sleepBaselineHours` fixed at `SLEEP_BASELINE_HOURS`
- Modify: `src/ui/room/roomModel.ts` — drop the mirror's "% tuned" row

- [ ] **Step 1: Write the failing test** — a persisted profile carrying `mode`, `painted` and `peakStartHour` still loads, and `paramsFor` ignores them.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Delete and shrink.**
- [ ] **Step 4: Run the suite and check coverage.** Deleting tested code can *raise* coverage; if it drops, something newly-uncovered is being reached.
- [ ] **Step 5: Commit** — `refactor: delete the calibration nothing read`

---

## Task 17b: Join the Telegram loop to the block log

§8b②. The bot already asks the right question and writes the answer; it writes it in the old
vocabulary and without the columns that make it readable. Until this lands, answering on your
phone still teaches the app nothing.

**Files:**
- Modify: `api/telegram.ts` — `recordBlockAnswer` writes the four-answer vocabulary and the three
  new columns
- Modify: `src/telegram/handle.ts`, `handle.test.ts` — the `blockAnswer` intent carries them
- Modify: `src/telegram/commands.ts`, `commands.test.ts` — `/yesterday`'s buttons
- Modify: `src/telegram/update.ts`, `update.test.ts` — parsing the callback payload

- [ ] **Step 1: Write the failing test** in `src/telegram/handle.test.ts` — answering a block
  produces a record carrying `type`, `plannedHours` and `dayIndex` taken from the week the bot
  already loaded, and the answer is one of the four.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Change `/yesterday`'s buttons** to **Didn't happen · Took less · About right ·
  Took longer**, matching the today card exactly. A student who answers in both places must not
  meet two different questions.
- [ ] **Step 4: Widen the callback payload** so the bot sends the block's type, planned hours and
  day index back with the answer — it has the week in hand when it builds the buttons, and the
  callback is the only place that information survives the round trip.
- [ ] **Step 5: Thread it through `api/telegram.ts`'s `recordBlockAnswer`.** Keep the upsert on
  `(account_id, block_id)`: a second press must correct the first rather than add a row.
- [ ] **Step 6: Verify the join.** Add a test that a record written by the bot's shape produces
  the same `BlockOutcome` as one written by the today card. This is the assertion that the two
  loops have actually met — everything else in this task is plumbing toward it.
- [ ] **Step 7: Run the suite.** `npm test`
- [ ] **Step 8: Commit** — `feat: let answering on your phone reach the engine`

---

## Task 18: The guard test, and responsive verification

§12, §13. This is what stops the design system decaying back into eighteen hand-written buttons.

**Files:**
- Create: `src/ui/kit/palette.test.ts`

- [ ] **Step 1: Write the guard**

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**, listing every file still carrying a raw colour.
- [ ] **Step 3: Move each offender onto a token or a `kit/` component** until the list is empty. Do not add exemptions to make it pass.
- [ ] **Step 4: Verify responsively.** `npm run dev`, then at **320 / 390 / 768 / 1280px** check: no horizontal scroll; the room screen keeps both buttons above the fold with the paragraph capped; the day hour-grid is readable; every `Sheet`'s action bar sits in the lower half.
- [ ] **Step 5: Run everything.** `npm test && npm run typecheck && npm run test:coverage`
- [ ] **Step 6: Commit** — `test: stop the palette decaying back into eighteen buttons`

---

## Done when

- `npm test`, `npm run typecheck` and `npm run test:coverage` all pass, coverage at or above 97 / 91 / 97 / 98
- `src/ui/calibration/`, `hotspots.ts`, `outings.ts`, `recoveryLog.ts`, `painter.ts`, `RoomSidebar.tsx`, `LowEnergyView.tsx` are gone
- `RoomShell.tsx` is under 200 lines
- `palette.test.ts` passes with no exemptions beyond the room drawing
- Every one of §1.3's nine bindings still renders, and the plant and bed now **move** when sleep is reported
