# Say-Anything Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student type an unstructured brain dump and get an editable, structured week back — plus the `/api` layer that keeps the Groq key off the browser, which every remaining feature needs.

**Architecture:** `api/plan.ts` is a Vercel function holding the key; `src/ai/parseBrainDump.ts` asks it and falls back to `src/ai/fallbackParser.ts` — a real rule-based parser — whenever it cannot. Every model reply is Zod-validated at the boundary before it becomes an item. Confirm-chips gate everything: nothing reaches the schedule unconfirmed.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Zod (already present), Vercel functions, Vitest 4 + Testing Library, Playwright.

**Spec:** Approved plain-language plan at `C:\Users\den51\.claude\plans\crispy-floating-river.md`. Product spec [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §3.1–3.3, §1.4's never-import-silently rule, §10. Read all three.

## Global Constraints

- **No API key reaches the browser** (§10, constraint 1). `GROQ_API_KEY` has no `VITE_` prefix and must never gain one; only `api/` reads it.
- **Every model reply is Zod-validated at the boundary.** A response is not trusted for having passed through our own server; nothing downstream treats it as checked (project rule).
- **A model may propose, never originate authority.** It can suggest a title, load type, effort or implied deadline. It may not set a protected-rest block, alter a budget, or write to storage.
- **Nothing enters unconfirmed** (§1.4, §3.2). Items surface as editable chips; low confidence is visibly flagged, never silently guessed.
- **The fallback is a real parser, not a stub.** §10 requires hardcoded fallbacks; here it is also what makes CI green with no secrets and the demo survive a dead network.
- **`src/engine/**` and `src/optimizer/**` must not change.**
- **Responsive at 320 / 390 / 768 / 1280px**; the chip list wraps and never scrolls horizontally (§10).
- **Immutability**; files 200–400 lines; functions under 50 lines.
- **TDD, red before green.** Tests ship in the same commit as behaviour.
- **Coverage thresholds only go up.** Currently 97 / 91 / 97 / 98.
- **Never `git push`** without explicit confirmation.
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Rationale |
|---|---|---|
| `MAX_INPUT_LENGTH` | `2000` | A brain dump, not a document. Bounds the prompt and the cost. |
| `MAX_ITEMS` | `25` | More than a fortnight can hold; guards a runaway reply. |
| `DEFAULT_EFFORT_HOURS` | `1` | Used when nothing in the text implies effort. |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq's current general model. |
| `GROQ_TIMEOUT_MS` | `8000` | §10's constraint 3: time-box the call, fall back rather than hang. |

---

## File Structure

```
api/
  plan.ts                  Vercel function: the only place the Groq key is read
src/
  ai/
    types.ts               ParsedItem, ParseOutcome
    schema.ts              Zod schema for a model reply
    schema.test.ts
    groq.ts                the model call, server-side only
    fallbackParser.ts      the rule-based parser
    fallbackParser.test.ts
    parseBrainDump.ts      client entry: ask /api, fall back
    parseBrainDump.test.ts
    index.ts
  domain/
    addItems.ts            accepted items -> schedule
    addItems.test.ts
  ui/planner/
    PlannerScreen.tsx      the box, the chips, accept/cancel
    PlannerScreen.test.tsx
    ItemChip.tsx           one editable chip
    ItemChip.test.tsx
vercel.json
```

---

## Task 1: The shape of a parsed item, and the schema that guards it

**Files:**
- Create: `src/ai/types.ts`, `src/ai/schema.ts`, `src/ai/schema.test.ts`

**Interfaces:**
- Produces:
  - `interface ParsedItem { readonly id: string; readonly title: string; readonly type: LoadType; readonly hours: number; readonly deadlineDay: number | null; readonly hard: boolean; readonly confident: boolean }`
  - `type ParseOutcome = { readonly items: readonly ParsedItem[]; readonly source: 'model' | 'fallback' }`
  - `const MAX_INPUT_LENGTH: number`, `const MAX_ITEMS: number`
  - `function parseModelReply(raw: unknown): ParsedItem[] | null`

- [ ] **Step 1: Write the failing test**

`src/ai/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseModelReply } from './schema'

const good = {
  items: [
    { title: 'WIA3001 essay', type: 'mental', hours: 4, deadlineDay: 5, hard: true },
    { title: 'Laundry', type: 'errands', hours: 1, deadlineDay: null, hard: false },
  ],
}

describe('parseModelReply', () => {
  it('accepts a well-formed reply', () => {
    const items = parseModelReply(good)

    expect(items).toHaveLength(2)
    expect(items?.[0]?.title).toBe('WIA3001 essay')
  })

  it('gives every item an id, so chips can be edited and removed', () => {
    const ids = parseModelReply(good)?.map((item) => item.id)

    expect(new Set(ids).size).toBe(2)
  })

  /**
   * The project's rule about untrusted input, at the one place it matters most. A model
   * reply is not trusted for having come through our own server, and a bad load type
   * reaching the engine would corrupt every projection from then on.
   */
  it('rejects a load type the model invented', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], type: 'spiritual' }] })).toBeNull()
  })

  it('rejects a reply that is not an object at all', () => {
    expect(parseModelReply('sure, here you go!')).toBeNull()
    expect(parseModelReply(null)).toBeNull()
  })

  it('rejects an item with no title', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], title: '' }] })).toBeNull()
  })

  it('rejects negative or absurd effort', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], hours: -3 }] })).toBeNull()
    expect(parseModelReply({ items: [{ ...good.items[0], hours: 500 }] })).toBeNull()
  })

  it('rejects a deadline outside the horizon', () => {
    expect(parseModelReply({ items: [{ ...good.items[0], deadlineDay: 90 }] })).toBeNull()
  })

  // A runaway reply must not become a runaway week.
  it('rejects a reply with far too many items', () => {
    const items = Array.from({ length: 40 }, () => good.items[0])

    expect(parseModelReply({ items })).toBeNull()
  })

  it('accepts an empty list, because a student may type something with nothing in it', () => {
    expect(parseModelReply({ items: [] })).toEqual([])
  })

  // Anything the model returns is treated as a proposal needing a human look.
  it('marks everything from the model as needing confirmation', () => {
    expect(parseModelReply(good)?.every((item) => item.confident)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/schema.test.ts`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Write the types**

`src/ai/types.ts`:

```ts
import type { LoadType } from '../engine'

export interface ParsedItem {
  readonly id: string
  readonly title: string
  readonly type: LoadType
  readonly hours: number
  /** Day index within the horizon, or null when nothing in the text implied one. */
  readonly deadlineDay: number | null
  readonly hard: boolean
  /**
   * Whether this was read with confidence. §1.4 requires low-confidence rows to be
   * visibly flagged rather than silently guessed — a wrong deadline quietly poisoning
   * every projection is the fastest way to lose a student's trust, and they cannot debug
   * what they never saw.
   */
  readonly confident: boolean
}

export interface ParseOutcome {
  readonly items: readonly ParsedItem[]
  readonly source: 'model' | 'fallback'
}

/** A brain dump, not a document. Bounds the prompt and the cost. */
export const MAX_INPUT_LENGTH = 2000

/** More than a fortnight can hold. Guards against a runaway reply becoming a runaway
 *  week. */
export const MAX_ITEMS = 25

export const DEFAULT_EFFORT_HOURS = 1
```

- [ ] **Step 4: Write the schema**

`src/ai/schema.ts`:

```ts
import { z } from 'zod'
import { HORIZON_DAYS, LOAD_TYPES } from '../engine'
import { MAX_ITEMS, type ParsedItem } from './types'

/**
 * The boundary the project's untrusted-input rule names.
 *
 * A model reply is not trusted for having passed through our own server. This is the one
 * place it becomes data, and a load type the model invented would corrupt every
 * projection from here on — so the enum is the engine's own list rather than a copy that
 * could drift.
 */
const replySchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        type: z.enum(LOAD_TYPES),
        hours: z.number().positive().max(24),
        deadlineDay: z.number().int().min(0).max(HORIZON_DAYS - 1).nullable(),
        hard: z.boolean(),
      }),
    )
    .max(MAX_ITEMS),
})

let counter = 0
const nextId = (): string => {
  counter += 1
  return `parsed-${counter}`
}

/** Null rather than throwing: a malformed reply is an expected outcome that falls back to
 *  the rule-based parser, not an exceptional one. */
export function parseModelReply(raw: unknown): ParsedItem[] | null {
  const result = replySchema.safeParse(raw)
  if (!result.success) return null

  return result.data.items.map((item) => ({
    id: nextId(),
    ...item,
    // Everything from the model is a proposal. §3.2: nothing enters unconfirmed.
    confident: false,
  }))
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck`

```bash
git add src/ai
git commit -m "$(cat <<'EOF'
feat: add the parsed-item shape and the schema guarding it

The boundary this project's untrusted-input rule names. A model reply
is not trusted for having passed through our own server, and this is
the one place it becomes data.

The load-type enum is the engine's own list rather than a copy, because
a type the model invented would corrupt every projection from then on
and a drifting duplicate is how that gets in.

Bounded on every axis a runaway reply could exploit: title length,
effort, deadline within the horizon, and item count. A malformed reply
returns null rather than throwing, because falling back to the
rule-based parser is an expected outcome rather than an exceptional
one.

Everything from the model is marked as needing confirmation. §3.2 is
explicit that nothing enters unconfirmed, and defaulting the other way
would make that a UI convention rather than a property of the data.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The rule-based parser

**Files:**
- Create: `src/ai/fallbackParser.ts`, `src/ai/fallbackParser.test.ts`

**Interfaces:**
- Produces: `function parseWithRules(text: string, today?: number): ParsedItem[]`

- [ ] **Step 1: Write the failing test**

`src/ai/fallbackParser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseWithRules } from './fallbackParser'

// §3.1's own example, verbatim.
const brainDump =
  "essay due friday 2000 words haven't started, mums birthday sunday need a present, " +
  'gym been skipping, group meeting sometime this week, laundry, that internship application'

describe('parseWithRules', () => {
  it('splits a brain dump into separate items', () => {
    expect(parseWithRules(brainDump).length).toBeGreaterThanOrEqual(5)
  })

  it('keeps what the student wrote as the title', () => {
    expect(parseWithRules('laundry')[0]?.title.toLowerCase()).toContain('laundry')
  })

  it('splits on newlines as well as commas', () => {
    expect(parseWithRules('essay\ngym\nlaundry')).toHaveLength(3)
  })

  it('ignores empty fragments from trailing punctuation', () => {
    expect(parseWithRules('laundry,,,')).toHaveLength(1)
  })

  it('returns nothing for an empty dump', () => {
    expect(parseWithRules('')).toEqual([])
    expect(parseWithRules('   ')).toEqual([])
  })

  // The load types are what the engine reasons in, so guessing them is the parser's most
  // valuable job -- a gym session counted as study would distort the whole projection.
  it('reads study work as mental load', () => {
    expect(parseWithRules('finish the essay')[0]?.type).toBe('mental')
  })

  it('reads exercise as physical load', () => {
    expect(parseWithRules('gym been skipping')[0]?.type).toBe('physical')
  })

  it('reads seeing people as social load', () => {
    expect(parseWithRules('coffee with sarah')[0]?.type).toBe('social')
  })

  it('reads chores as errands', () => {
    expect(parseWithRules('laundry')[0]?.type).toBe('errands')
  })

  it('falls back to errands when nothing in the words says otherwise', () => {
    expect(parseWithRules('that thing i keep forgetting')[0]?.type).toBe('errands')
  })

  it('reads an explicit day into a deadline', () => {
    const item = parseWithRules('essay due friday', 0)[0]

    expect(item?.deadlineDay).not.toBeNull()
    expect(item?.hard).toBe(true)
  })

  it('leaves items with no stated deadline undated and soft', () => {
    const item = parseWithRules('gym')[0]

    expect(item?.deadlineDay).toBeNull()
    expect(item?.hard).toBe(false)
  })

  it('reads a word count into a bigger effort estimate', () => {
    const essay = parseWithRules('essay 2000 words')[0]
    const chore = parseWithRules('laundry')[0]

    expect(essay?.hours).toBeGreaterThan(chore?.hours ?? 0)
  })

  /**
   * §1.4: low-confidence rows are flagged rather than silently guessed. A rule-based
   * parser guessing a load type from one word is exactly the case that needs flagging,
   * and marking everything confident would make the flag meaningless.
   */
  it('flags a guess it is not sure about', () => {
    expect(parseWithRules('that internship application')[0]?.confident).toBe(false)
  })

  it('is confident about something it read a real signal from', () => {
    expect(parseWithRules('gym')[0]?.confident).toBe(true)
  })

  it('gives every item its own id', () => {
    const ids = parseWithRules(brainDump).map((item) => item.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never returns more items than a fortnight can hold', () => {
    const huge = Array.from({ length: 60 }, (_, i) => `task ${i}`).join(', ')

    expect(parseWithRules(huge).length).toBeLessThanOrEqual(25)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/fallbackParser.test.ts`
Expected: FAIL — cannot resolve `./fallbackParser`.

- [ ] **Step 3: Implement**

`src/ai/fallbackParser.ts`:

```ts
import { HORIZON_DAYS, type LoadType } from '../engine'
import { DEFAULT_EFFORT_HOURS, MAX_ITEMS, type ParsedItem } from './types'

/**
 * A real parser, not a stub.
 *
 * §10 requires a hardcoded fallback for every external dependency, and this one does
 * double duty: it is what makes the test suite runnable with no secrets, what keeps CI
 * green, and what keeps the demo alive if the network dies on stage. A student with no
 * key configured still gets a structured week — worse than the model's, and far better
 * than nothing.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Words that reliably indicate a load type. Deliberately small: a long list guesses more
 *  often and is wrong more often, and every wrong guess costs trust. */
const SIGNALS: ReadonlyArray<{ type: LoadType; words: readonly string[] }> = [
  {
    type: 'mental',
    words: ['essay', 'assignment', 'report', 'revision', 'study', 'exam', 'reading', 'lecture', 'thesis', 'chapter'],
  },
  { type: 'physical', words: ['gym', 'run', 'walk', 'swim', 'football', 'training', 'exercise', 'yoga'] },
  { type: 'social', words: ['coffee', 'dinner', 'birthday', 'party', 'meeting', 'friend', 'family', 'call'] },
  { type: 'errands', words: ['laundry', 'shopping', 'groceries', 'bank', 'post', 'clean', 'tidy', 'bills'] },
]

/** Splits on the punctuation people actually use in a dump. */
const splitFragments = (text: string): string[] =>
  text
    .split(/[,;\n]+/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment.length > 0)

function typeOf(lower: string): { type: LoadType; confident: boolean } {
  for (const signal of SIGNALS) {
    if (signal.words.some((word) => lower.includes(word))) {
      return { type: signal.type, confident: true }
    }
  }

  // Nothing recognisable. Errands is the least disruptive default -- it is the cheapest
  // load type, so a wrong guess distorts the projection least -- and it is flagged so the
  // student can correct it before it counts.
  return { type: 'errands', confident: false }
}

function deadlineOf(lower: string, today: number): number | null {
  const named = WEEKDAYS.findIndex((day) => lower.includes(day))
  if (named === -1) return null

  const todayWeekday = today % 7
  const ahead = (named - todayWeekday + 7) % 7

  return Math.min(today + (ahead === 0 ? 7 : ahead), HORIZON_DAYS - 1)
}

function hoursOf(lower: string): number {
  const words = lower.match(/(\d{3,5})\s*words?/)
  if (words) {
    // Roughly 500 words an hour, including the thinking rather than only the typing.
    return Math.max(1, Math.round(Number(words[1]) / 500))
  }

  const hours = lower.match(/(\d+)\s*(?:hours?|hrs?)/)
  if (hours) return Math.min(24, Math.max(1, Number(hours[1])))

  return DEFAULT_EFFORT_HOURS
}

let counter = 0

export function parseWithRules(text: string, today = 0): ParsedItem[] {
  return splitFragments(text)
    .slice(0, MAX_ITEMS)
    .map((fragment) => {
      const lower = fragment.toLowerCase()
      const { type, confident } = typeOf(lower)
      const deadlineDay = deadlineOf(lower, today)

      counter += 1

      return {
        id: `rule-${counter}`,
        title: fragment,
        type,
        hours: hoursOf(lower),
        deadlineDay,
        // A stated day is the student saying it is fixed. Everything else is soft until
        // they say otherwise.
        hard: deadlineDay !== null,
        confident,
      }
    })
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck`

```bash
git add src/ai
git commit -m "$(cat <<'EOF'
feat: parse a brain dump with rules, so the app works with no key

§10 requires a hardcoded fallback for every external dependency, and
this one does double duty: it is what makes the suite runnable with no
secrets, what keeps CI green, and what keeps the demo alive if the
network dies on stage. A real parser, not a stub that throws.

The signal word list is deliberately short. A longer one guesses more
often and is wrong more often, and every wrong guess costs trust --
which is the currency §1.4's never-import-silently rule is protecting.

Anything it cannot read falls to errands and is flagged as unsure.
Errands because it is the cheapest load type, so a wrong guess distorts
the projection least; flagged because §1.4 requires low-confidence rows
to be visible rather than silently guessed, and marking everything
confident would make the flag meaningless.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The endpoint, and asking it

**Files:**
- Create: `api/plan.ts`, `src/ai/groq.ts`, `src/ai/parseBrainDump.ts`, `src/ai/parseBrainDump.test.ts`, `src/ai/index.ts`, `vercel.json`
- Modify: `.env.example`, `vitest.config.ts`

**Interfaces:**
- Produces:
  - `function askGroq(text: string, apiKey: string): Promise<ParsedItem[] | null>`
  - `function parseBrainDump(text: string): Promise<ParseOutcome>`

- [ ] **Step 1: Write the failing test**

`src/ai/parseBrainDump.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBrainDump } from './parseBrainDump'

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('parseBrainDump', () => {
  it('uses the model when the endpoint answers', async () => {
    respondWith(200, {
      items: [{ title: 'Essay', type: 'mental', hours: 4, deadlineDay: 3, hard: true }],
    })

    const outcome = await parseBrainDump('essay due wednesday')

    expect(outcome.source).toBe('model')
    expect(outcome.items[0]?.title).toBe('Essay')
  })

  /**
   * The behaviour the whole fallback exists for. No key configured means the endpoint is
   * unavailable, which is the normal state in tests, in CI and in local development --
   * and it must produce a week rather than an error.
   */
  it('falls back to rules when the endpoint is unavailable', async () => {
    respondWith(404, {})

    const outcome = await parseBrainDump('gym, laundry')

    expect(outcome.source).toBe('fallback')
    expect(outcome.items).toHaveLength(2)
  })

  it('falls back when the network fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const outcome = await parseBrainDump('gym, laundry')

    expect(outcome.source).toBe('fallback')
    expect(outcome.items).toHaveLength(2)
  })

  // A reply that fails validation is not better than no reply.
  it('falls back when the model returns something malformed', async () => {
    respondWith(200, { items: [{ title: 'Essay', type: 'invented', hours: 4 }] })

    const outcome = await parseBrainDump('essay')

    expect(outcome.source).toBe('fallback')
  })

  it('returns nothing for an empty dump without calling out at all', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const outcome = await parseBrainDump('   ')

    expect(outcome.items).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an input longer than a brain dump', async () => {
    respondWith(200, { items: [] })

    const outcome = await parseBrainDump('x'.repeat(5000))

    expect(outcome.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/parseBrainDump.test.ts`
Expected: FAIL — cannot resolve `./parseBrainDump`.

- [ ] **Step 3: Write the client entry**

`src/ai/parseBrainDump.ts`:

```ts
import { parseWithRules } from './fallbackParser'
import { parseModelReply } from './schema'
import { MAX_INPUT_LENGTH, type ParseOutcome } from './types'

/**
 * Asks the endpoint, and falls back to rules whenever it cannot.
 *
 * "Cannot" covers more than an outage: no key configured, running under `vite dev` where
 * `/api` is not served, a timeout, or a reply that fails validation. All of them are
 * ordinary states rather than errors, and every one has to produce a usable week — §10's
 * "nothing is called live on stage" instinct applied to the one path a student cannot do
 * without.
 */
export async function parseBrainDump(text: string): Promise<ParseOutcome> {
  const trimmed = text.trim()

  // Nothing to do, and no reason to spend a request finding that out.
  if (trimmed === '' || trimmed.length > MAX_INPUT_LENGTH) {
    return { items: [], source: 'fallback' }
  }

  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
    })

    if (response.ok) {
      const items = parseModelReply(await response.json())
      if (items !== null) return { items, source: 'model' }
    }
  } catch {
    // Falls through to the rules below.
  }

  return { items: parseWithRules(trimmed), source: 'fallback' }
}
```

- [ ] **Step 4: Write the model call and the endpoint**

`src/ai/groq.ts`:

```ts
import { parseModelReply } from './schema'
import { MAX_ITEMS, type ParsedItem } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

/** §10, constraint 3: the call is time-boxed and falls back rather than hanging the
 *  confirm screen. */
const GROQ_TIMEOUT_MS = 8000

const SYSTEM_PROMPT = [
  'You turn a student\'s unstructured notes into a task list.',
  'Reply with JSON only, shaped {"items":[{"title","type","hours","deadlineDay","hard"}]}.',
  'type is one of: mental, physical, social, errands.',
  'hours is your estimate of effort, between 0 and 24.',
  'deadlineDay is a day index from 0 (today) to 20, or null if none is implied.',
  'hard is true only when the student stated a fixed date or deadline.',
  `Return at most ${MAX_ITEMS} items. Do not invent tasks the notes do not mention.`,
].join(' ')

/**
 * The only place the Groq key is used, and it is only ever reached from `api/`.
 *
 * The reply is validated by the same schema the client uses, so a malformed answer is
 * caught here rather than travelling one hop further into the app.
 */
export async function askGroq(text: string, apiKey: string): Promise<ParsedItem[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseModelReply(JSON.parse(content))
  } catch {
    // A timeout, a network failure, or JSON that is not JSON. All the same answer: the
    // caller falls back.
    return null
  } finally {
    clearTimeout(timeout)
  }
}
```

`api/plan.ts`:

```ts
import { askGroq } from '../src/ai/groq'
import { MAX_INPUT_LENGTH } from '../src/ai/types'

/**
 * The server side of the planner, and the only place `GROQ_API_KEY` is read.
 *
 * §10, constraint 1: a key that reaches the browser leaks in devtools. That is why this
 * exists at all rather than the client calling Groq directly.
 *
 * With no key configured it answers 503 rather than erroring, because the client treats
 * an unavailable endpoint as an ordinary state and falls back to rules — which is the
 * normal path in tests, in CI, and under `vite dev` where `/api` is not served.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Planner unavailable', { status: 503 })

  let text: unknown
  try {
    text = ((await request.json()) as { text?: unknown }).text
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  // Bounded before it reaches the model: this is user input arriving from the network,
  // and the length cap is what stops a request costing whatever someone chooses to paste.
  if (typeof text !== 'string' || text.trim() === '' || text.length > MAX_INPUT_LENGTH) {
    return new Response('Bad request', { status: 400 })
  }

  const items = await askGroq(text, apiKey)
  if (items === null) return new Response('Planner unavailable', { status: 503 })

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

`vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

`src/ai/index.ts`:

```ts
export { parseBrainDump } from './parseBrainDump'
export { parseWithRules } from './fallbackParser'
export { parseModelReply } from './schema'
export { MAX_INPUT_LENGTH, MAX_ITEMS, type ParsedItem, type ParseOutcome } from './types'
```

- [ ] **Step 5: Keep the key out of the tests**

In `vitest.config.ts`, add to the `env` block that already blanks the Supabase settings:

```ts
      // The planner's key gets the same lock as the storage ones: the suite must never
      // be able to spend money or reach a live model.
      GROQ_API_KEY: '',
```

In `.env.example`, the `GROQ_API_KEY` entry already exists under the server-side section.
Add to its comment: `Read only by api/plan.ts. A VITE_ prefix here would publish it.`

- [ ] **Step 6: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck && npm run build`

```bash
git add src/ai api vercel.json vitest.config.ts .env.example
git commit -m "$(cat <<'EOF'
feat: add the planner endpoint, with the key kept off the browser

§10's first constraint is that no API key reaches the browser, because
a client-side call leaks it in devtools. This is the first thing on the
far side of that boundary: api/plan.ts is the only place GROQ_API_KEY
is read.

Every reply is validated by the same schema on both sides, so a
malformed answer is caught at the server rather than travelling one hop
further into the app.

An unavailable endpoint is an ordinary state, not an error. No key
configured, running under `vite dev` where /api is not served, a
timeout, a malformed reply -- all of them fall back to the rule-based
parser, because the one path a student cannot do without is the one
that must never depend on a network.

The call is time-boxed per §10's third constraint, and the input is
length-bounded before it reaches the model: this is user input arriving
over the network, and the cap is what stops a request costing whatever
someone chooses to paste.

The suite blanks the key alongside the Supabase ones, so it can never
spend money or reach a live model.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Confirm chips

**Files:**
- Create: `src/ui/planner/ItemChip.tsx`, `src/ui/planner/ItemChip.test.tsx`, `src/ui/planner/PlannerScreen.tsx`, `src/ui/planner/PlannerScreen.test.tsx`

**Interfaces:**
- Produces:
  - `function ItemChip(props: { item: ParsedItem; onChange: (next: ParsedItem) => void; onRemove: (id: string) => void }): JSX.Element`
  - `function PlannerScreen(props: { onAccept: (items: readonly ParsedItem[]) => void; onCancel: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing tests**

`src/ui/planner/ItemChip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../../ai'
import { ItemChip } from './ItemChip'

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'WIA3001 essay',
  type: 'mental',
  hours: 4,
  deadlineDay: 5,
  hard: true,
  confident: true,
  ...over,
})

const setup = (over: Partial<ParsedItem> = {}) => {
  const props = { item: item(over), onChange: vi.fn(), onRemove: vi.fn() }
  render(<ItemChip {...props} />)
  return props
}

describe('ItemChip', () => {
  it('shows what was understood', () => {
    setup()

    expect(screen.getByDisplayValue('WIA3001 essay')).toBeVisible()
  })

  // §3.2: retyped, recategorised or deleted with one tap.
  it('lets the title be retyped', async () => {
    const props = setup()

    await userEvent.type(screen.getByLabelText(/what/i), '!')

    expect(props.onChange).toHaveBeenCalled()
  })

  it('lets the load type be changed', async () => {
    const props = setup()

    await userEvent.selectOptions(screen.getByLabelText(/kind/i), 'physical')

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'physical' }))
  })

  it('lets the item be removed', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /remove/i }))

    expect(props.onRemove).toHaveBeenCalledWith('a')
  })

  /**
   * §1.4: low-confidence rows are flagged rather than silently guessed. A wrong deadline
   * quietly poisoning every projection is the fastest way to lose trust, and a student
   * cannot debug what they never saw.
   */
  it('flags an item it was unsure about', () => {
    setup({ confident: false })

    expect(screen.getByTestId('chip-unsure-a')).toBeVisible()
  })

  it('does not flag one it read confidently', () => {
    setup({ confident: true })

    expect(screen.queryByTestId('chip-unsure-a')).toBeNull()
  })
})
```

`src/ui/planner/PlannerScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlannerScreen } from './PlannerScreen'

// No endpoint in tests, so every case exercises the rule-based path -- which is also
// what CI and the demo run on.
afterEach(() => vi.unstubAllGlobals())

const setup = () => {
  const props = { onAccept: vi.fn(), onCancel: vi.fn() }
  render(<PlannerScreen {...props} />)
  return props
}

describe('PlannerScreen', () => {
  it('starts with an empty box and nothing to accept', () => {
    setup()

    expect(screen.getByLabelText(/what.*carrying|brain dump|on your mind/i)).toHaveValue('')
    expect(screen.queryByRole('button', { name: /add these/i })).toBeNull()
  })

  it('turns a brain dump into chips', async () => {
    setup()

    await userEvent.type(screen.getByRole('textbox'), 'essay due friday, gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))

    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(3))
  })

  // §3.2: nothing enters unconfirmed. The chips are a gate, not a preview.
  it('accepts only after the student says so', async () => {
    const props = setup()

    await userEvent.type(screen.getByRole('textbox'), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    expect(props.onAccept).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ title: 'gym' })]),
    )
  })

  it('drops an item the student removed', async () => {
    const props = setup()

    await userEvent.type(screen.getByRole('textbox'), 'gym, laundry')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!)
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([expect.objectContaining({ title: 'laundry' })])
  })

  it('says when it understood nothing rather than showing an empty list', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /read this/i }))

    expect(await screen.findByText(/nothing|type something/i)).toBeVisible()
  })

  it('can be cancelled', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(props.onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/ui/planner`
Expected: FAIL — cannot resolve `./ItemChip` and `./PlannerScreen`.

- [ ] **Step 3: Write the chip**

`src/ui/planner/ItemChip.tsx`:

```tsx
import { LOAD_TYPES, type LoadType } from '../../engine'
import type { ParsedItem } from '../../ai'

const LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

export function ItemChip({
  item,
  onChange,
  onRemove,
}: {
  item: ParsedItem
  onChange: (next: ParsedItem) => void
  onRemove: (id: string) => void
}) {
  return (
    <li data-testid={`chip-${item.id}`} className="flex flex-col gap-2 rounded-lg bg-slate-100 p-3">
      <label className="flex flex-col gap-1 text-xs">
        What
        <input
          value={item.title}
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Kind
          <select
            value={item.type}
            onChange={(event) => onChange({ ...item, type: event.target.value as LoadType })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {LOAD_TYPES.map((type) => (
              <option key={type} value={type}>
                {LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          Hours
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={item.hours}
            onChange={(event) => onChange({ ...item, hours: Number(event.target.value) })}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="ml-auto text-sm underline"
        >
          Remove
        </button>
      </div>

      {/* §1.4: flagged rather than silently guessed. A student cannot correct what they
          were never shown. */}
      {!item.confident && (
        <p data-testid={`chip-unsure-${item.id}`} className="text-xs text-amber-800">
          Not sure about this one — check it before adding.
        </p>
      )}
    </li>
  )
}
```

- [ ] **Step 4: Write the screen**

`src/ui/planner/PlannerScreen.tsx`:

```tsx
import { useState } from 'react'
import { parseBrainDump, type ParsedItem } from '../../ai'
import { ItemChip } from './ItemChip'

export function PlannerScreen({
  onAccept,
  onCancel,
}: {
  onAccept: (items: readonly ParsedItem[]) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [reading, setReading] = useState(false)

  async function onRead() {
    setReading(true)
    try {
      const outcome = await parseBrainDump(text)
      setItems([...outcome.items])
    } finally {
      setReading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">What are you carrying?</h1>
        <p className="text-sm opacity-70">
          Type it however it comes out. Any order, no formatting.
        </p>
      </header>

      <label className="flex flex-col gap-1 text-sm">
        What is on your mind
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          className="rounded-lg border border-slate-300 p-3"
          placeholder="essay due friday 2000 words haven't started, mums birthday sunday, gym, laundry"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onRead()}
          disabled={reading}
          className="rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-60"
        >
          {reading ? 'Reading…' : 'Read this'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-3 underline">
          Cancel
        </button>
      </div>

      {items !== null && items.length === 0 && (
        <p className="text-sm opacity-80">
          I could not find anything in that. Type something and try again.
        </p>
      )}

      {items !== null && items.length > 0 && (
        <>
          {/* §3.2: a gate, not a preview. The chip list wraps and never scrolls
              sideways, per §10. */}
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ItemChip
                key={item.id}
                item={item}
                onChange={(next) =>
                  setItems(items.map((existing) => (existing.id === next.id ? next : existing)))
                }
                onRemove={(id) => setItems(items.filter((existing) => existing.id !== id))}
              />
            ))}
          </ul>

          <button
            type="button"
            onClick={() => onAccept(items)}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white sm:w-auto"
          >
            Add these to my week
          </button>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/ui/planner && npm run typecheck`

```bash
git add src/ui/planner
git commit -m "$(cat <<'EOF'
feat: confirm what was understood before any of it counts

§3.2 and §1.4 share one rule: never import silently. What the parser
understood arrives as editable chips -- retype the title, change the
kind, correct the hours, remove it entirely -- and nothing reaches the
week until the student says so. The chips are a gate, not a preview.

Anything read without a real signal is flagged as unsure rather than
quietly guessed. A wrong deadline poisoning every projection from then
on is the fastest way to lose trust, and a student cannot correct what
they were never shown.

Understanding nothing says so, rather than rendering an empty list that
looks like a bug.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Putting accepted items into the week

**Files:**
- Create: `src/domain/addItems.ts`, `src/domain/addItems.test.ts`
- Modify: `src/ui/HomeScreen.tsx`, `src/ui/HomeScreen.room.test.tsx`, `tests/e2e/planner.spec.ts` (new)

**Interfaces:**
- Produces: `function addItems(schedule: Schedule, items: readonly ParsedItem[]): Schedule`

- [ ] **Step 1: Write the failing test**

`src/domain/addItems.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { addItems } from './addItems'

const empty = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const parsed = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'a',
  title: 'Essay',
  type: 'mental',
  hours: 3,
  deadlineDay: null,
  hard: false,
  confident: true,
  ...over,
})

describe('addItems', () => {
  it('puts accepted items into the week', () => {
    expect(addItems(empty(), [parsed()]).items).toHaveLength(1)
  })

  it('keeps what was already there', () => {
    const once = addItems(empty(), [parsed()])

    expect(addItems(once, [parsed({ id: 'b', title: 'Gym' })]).items).toHaveLength(2)
  })

  it('carries the title, type and effort across', () => {
    const item = addItems(empty(), [parsed({ title: 'Lab report', hours: 2.5 })]).items[0]

    expect(item?.title).toBe('Lab report')
    expect(item?.type).toBe('mental')
    expect(item?.hours).toBe(2.5)
  })

  // A deadline the student stated must survive into the model, or the optimizer will
  // happily move the item past it.
  it('keeps a stated deadline', () => {
    const item = addItems(empty(), [parsed({ deadlineDay: 4, hard: true })]).items[0]

    expect(item?.deadlineDay).toBe(4)
  })

  it('places a deadlined item on or before its deadline', () => {
    const item = addItems(empty(), [parsed({ deadlineDay: 2, hard: true })]).items[0]

    expect(item?.dayIndex).toBeLessThanOrEqual(2)
  })

  it('leaves an undated item movable', () => {
    const item = addItems(empty(), [parsed()]).items[0]

    expect(item?.deadlineDay).toBeNull()
    expect(item?.fixed).toBe(false)
  })

  /**
   * A model may propose but never originate authority. Nothing arriving from a parse can
   * become protected rest, which is the one thing in the schedule the optimizer may not
   * move.
   */
  it('never creates protected rest from parsed text', () => {
    const item = addItems(empty(), [parsed({ title: 'rest', type: 'mental' })]).items[0]

    expect(item?.protectedRest).toBe(false)
    expect(item?.fixed).toBe(false)
  })

  /**
   * A parse cannot tell a restorative coffee from an obligation, so the cautious error is
   * chosen: crediting recovery a student never got would report them as fine while they
   * sink, and that is the failure the engine already refuses elsewhere.
   */
  it('treats a parsed social item as draining rather than restorative', () => {
    const item = addItems(empty(), [parsed({ type: 'social', title: 'Group meeting' })]).items[0]

    expect(item?.kind).toBe('socialDraining')
  })

  it('gives every added item a distinct id', () => {
    const week = addItems(empty(), [parsed(), parsed({ id: 'b' })])

    expect(new Set(week.items.map((item) => item.id)).size).toBe(2)
  })

  it('does not mutate the week it was given', () => {
    const before = empty()
    const snapshot = JSON.stringify(before)
    addItems(before, [parsed()])

    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('does nothing when nothing was accepted', () => {
    expect(addItems(empty(), []).items).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/domain/addItems.test.ts`
Expected: FAIL — cannot resolve `./addItems`.

- [ ] **Step 3: Implement**

`src/domain/addItems.ts`:

```ts
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'

/** Placed in the evening by default: undated work is what a student fits around fixed
 *  commitments, and the optimizer is free to move it anyway. */
const DEFAULT_START_HOUR = 19

/** Somewhere with room, not day zero -- piling everything onto today is the shape the
 *  optimizer then has to undo. */
const DEFAULT_DAY = 2

/**
 * Social maps to draining, not restorative, and that asymmetry is deliberate.
 *
 * A parse cannot tell "coffee with Sarah" from "group meeting" reliably, so one of the
 * two errors has to be chosen. Treating an obligation as restorative would credit a
 * student with recovery they never got and report them as fine while they sink -- the
 * same class of bug as sleep curing loneliness, which the engine already refuses to do.
 * Treating a genuine restorative coffee as draining only under-reports recovery, which
 * errs toward caution. A student who disagrees changes the load type on the chip.
 */
const KIND_FOR = {
  mental: 'studyBlock',
  physical: 'lightExercise',
  social: 'socialDraining',
  errands: 'errands',
} as const

/**
 * Turns accepted chips into real schedule items.
 *
 * Everything here arrives from a parse, and a parse is a proposal. Nothing it produces
 * may be fixed or protected: a model that could create protected rest could pin a block
 * the optimizer is forbidden to move, which is the one guarantee §5.1 rests on.
 */
export function addItems(schedule: Schedule, items: readonly ParsedItem[]): Schedule {
  const added: ScheduledItem[] = items.map((item, index) => ({
    id: `added-${Date.now()}-${index}-${item.id}`,
    title: item.title,
    type: item.type,
    kind: KIND_FOR[item.type],
    hours: item.hours,
    intensity: 1,
    dayIndex:
      item.deadlineDay === null
        ? DEFAULT_DAY
        : Math.min(item.deadlineDay, HORIZON_DAYS - 1),
    startHour: DEFAULT_START_HOUR,
    // Never fixed, never protected. A proposal cannot pin anything.
    fixed: false,
    deadlineDay: item.deadlineDay,
    protectedRest: false,
  }))

  return { ...schedule, items: [...schedule.items, ...added] }
}
```

- [ ] **Step 4: Wire it into the home screen**

In `src/ui/HomeScreen.tsx`: import `PlannerScreen` and `addItems`; add
`const [planning, setPlanning] = useState(false)`; render the planner instead of the room
when `planning` is true:

```tsx
  if (planning) {
    return (
      <PlannerScreen
        onAccept={(items) => {
          setSchedule(addItems(schedule, items))
          setPlanning(false)
        }}
        onCancel={() => setPlanning(false)}
      />
    )
  }
```

and add a button beside "Rebalance my fortnight":

```tsx
        <button
          type="button"
          onClick={() => setPlanning(true)}
          data-testid="open-planner"
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-base sm:w-auto"
        >
          Tell me what you are carrying
        </button>
```

- [ ] **Step 5: Add the browser test**

`tests/e2e/planner.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
}

/**
 * No Groq key is configured for this suite, so this exercises the rule-based parser --
 * which is the same path CI and a network-less demo take. That is the point: the one
 * feature a student cannot do without must not depend on a model being reachable.
 */
test('turns a brain dump into a week', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('open-planner').click()
  await page.getByRole('textbox').fill('essay due friday, gym, laundry')
  await page.getByRole('button', { name: /read this/i }).click()

  await expect(page.getByTestId(/^chip-/).first()).toBeVisible()

  await page.getByRole('button', { name: /add these/i }).click()

  await expect(page.getByTestId('room-scene')).toBeVisible()
})

for (const width of [320, 1280]) {
  test(`the planner fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)
    await page.getByTestId('open-planner').click()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e`
Expected: all pass. If coverage dips below 97 / 91 / 97 / 98, add tests rather than
lowering the thresholds.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "$(cat <<'EOF'
feat: turn an accepted brain dump into a real week

§3.1 calls manual entry the single largest reason students abandon
planners, and the reason the rest of the spec is worthless if nobody
enters anything. This is the way in: type it however it comes out,
check what was understood, and it becomes the week the room and the
dial draw.

Nothing a parse produces may be fixed or protected. A model that could
create protected rest could pin a block the optimizer is forbidden to
move, and that guarantee is what §5.1's whole stance rests on -- so a
proposal stays a proposal all the way into the schedule.

Deadlines the student stated survive into the model, or the optimizer
would happily move the item past one.

The browser test drives the rule-based path, because no key is
configured for it. That is deliberate: the one feature a student cannot
do without must not depend on a model being reachable.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| §3.1 say-anything planner, unstructured in / structured out | 2, 3, 4 |
| §3.2 confirm chips, editable, low confidence flagged | 4 |
| §3.3 plan generation from real items | 5 (the existing optimizer does the rest) |
| §1.4 never import silently | 4 |
| §10 constraint 1: no key in the browser | 3 |
| §10 constraint 3: time-boxed model call with fallback | 3 |
| §10 hardcoded fallback | 2, 3 |
| Untrusted input validated at the boundary | 1 |
| Model may propose, never originate authority | 1, 5 |
| §3.1 voice input | **Not built.** §11 files it under "high value if time allows". |
| §1.4 photo import | Next plan. |
| §2.3 request box | Next plan. |

**Placeholder scan:** none.

**Type consistency:** `ParsedItem` is defined in `types.ts` (Task 1) and consumed unchanged
in 2, 3, 4, 5. `parseModelReply(raw) -> ParsedItem[] | null` matches between its definition
and both call sites (`groq.ts`, `parseBrainDump.ts`). `parseWithRules(text, today?)` matches
between Task 2 and `parseBrainDump.ts`. `addItems(schedule, items)` matches between Task 5's
definition and the `HomeScreen` call site.

**Two risks recorded:**

1. **`api/plan.ts` imports from `src/`.** Vercel builds functions separately from the Vite
   app, and a relative import across that boundary works but ties the function's build to
   the app's `tsconfig`. If the deploy fails on it, the fix is to inline `askGroq` into the
   function rather than to loosen the config.
2. **`vercel.json` changes how the deployment builds.** The project currently deploys with
   zero configuration and works. Adding the file makes the build explicit, which is what
   `api/` needs — but it is the one change here that could break a working deployment, and
   it should be the first thing checked if the preview fails.
