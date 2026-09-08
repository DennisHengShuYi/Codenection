# Photo Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student photograph an assignment brief, a planner page, a whiteboard or a lecture slide and get an editable week back — §1.4's primary input path.

**Architecture:** `api/read-photo.ts` is a second Vercel function holding the same Groq key; it asks a vision model and validates the reply with the planner's existing schema, so a photograph produces exactly the `ParsedItem[]` a brain dump produces. Everything downstream of that — the confirm chips, `addItems`, the week — is reused unchanged and already tested.

**Tech Stack:** React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Tailwind 4, Zod, Vercel Edge functions, Vitest 4 + Testing Library, Playwright.

**Spec:** Approved plain-language plan at `C:\Users\den51\.claude\plans\crispy-floating-river.md`. Product spec [`burnout-app-spec-v3.md`](../../../burnout-app-spec-v3.md) §1.4 (all of it), §11's must-build tier, §10. Read all three.

**Base:** Stacked on `feature/say-anything-planner` (PR #21), whose chips and `addItems` this reuses.

## Global Constraints

- **No API key reaches the browser** (§10, constraint 1). `GROQ_API_KEY` has no `VITE_` prefix and must never gain one; only `api/` reads it.
- **Every model reply is Zod-validated at the boundary**, on both sides. Reuse `parseModelReply` from `src/ai/schema.ts` — do not write a second schema, or the two drift and a vision reply becomes the unchecked path.
- **A model may propose, never originate authority.** It may not create protected rest, pin a block, or write to storage. `addItems` already enforces this; do not bypass it.
- **Nothing enters unconfirmed** (§1.4). This matters more here than in the planner: a student wrote their own brain dump and remembers it, but may never have read the brief closely — so a misread deadline is both likelier and less likely to be caught. The photo stays on screen beside the chips for exactly that reason.
- **No invented fallback.** There is no honest rule-based substitute for reading an image. With no key, say so — never guess at contents.
- **`src/engine/**`, `src/optimizer/**` and `src/ai/schema.ts` must not change.**
- **Responsive at 320 / 390 / 768 / 1280px**; the photo scales and never forces sideways scroll (§10).
- **Immutability**; files 200–400 lines; functions under 50 lines.
- **TDD, red before green.** Tests ship in the same commit as behaviour.
- **Coverage thresholds only go up.** Currently 97 / 91 / 97 / 98.
- **Never `git push`** without explicit confirmation.
- **Commit format:** `<type>: <description>`, ending `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

### Fixed values

| Constant | Value | Rationale |
|---|---|---|
| `MAX_IMAGE_BYTES` | `4 * 1024 * 1024` | Groq's vision limit for a base64 payload. Refuse above it locally rather than paying for a round trip that cannot succeed. |
| `ACCEPTED_TYPES` | `['image/jpeg','image/png','image/webp','image/heic']` | What a phone camera actually produces. HEIC included because iPhones default to it. |
| `VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` | Groq's current vision-capable model. |
| `VISION_TIMEOUT_MS` | `20000` | Longer than the planner's 8s: an image is far more to process. Still bounded, per §10's constraint 3. |

---

## File Structure

```
api/
  read-photo.ts            second Vercel function; same key, vision model
src/
  ai/
    vision.ts              the vision call, server-side only
    vision.test.ts
    readPhoto.ts           client entry: ask /api/read-photo, or say why it cannot
    readPhoto.test.ts
    image.ts               file -> data URL, with the bounds
    image.test.ts
    types.ts               MODIFY: image constants, PhotoOutcome
    index.ts               MODIFY: export the new client surface
  ui/planner/
    PhotoImportScreen.tsx  the button, the photo, the chips
    PhotoImportScreen.test.tsx
  ui/
    HomeScreen.tsx         MODIFY: second entry point
    HomeScreen.photo.test.tsx
tests/e2e/
  photo.spec.ts            refusal path and widths, in a real browser
```

---

## Task 1: Bounding an image before it costs anything

**Files:**
- Create: `src/ai/image.ts`, `src/ai/image.test.ts`
- Modify: `src/ai/types.ts`

**Interfaces:**
- Produces:
  - `const MAX_IMAGE_BYTES: number`, `const ACCEPTED_TYPES: readonly string[]`
  - `type ImageResult = { ok: true; dataUrl: string } | { ok: false; reason: string }`
  - `function readImageFile(file: File): Promise<ImageResult>`

- [ ] **Step 1: Write the failing test**

`src/ai/image.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, readImageFile } from './image'

const fileOf = (bytes: number, type = 'image/jpeg', name = 'brief.jpg'): File =>
  new File([new Uint8Array(bytes)], name, { type })

describe('readImageFile', () => {
  it('turns a photo into something sendable', async () => {
    const result = await readImageFile(fileOf(64))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  /**
   * Refused here rather than at the endpoint. An oversized image would be uploaded in
   * full, on a student's mobile data, only to be rejected -- and §10 budgets the whole
   * interaction, not just the model's half of it.
   */
  it('refuses an image too large to send, and says so in words', async () => {
    const result = await readImageFile(fileOf(MAX_IMAGE_BYTES + 1))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/too (big|large)/i)
  })

  it('accepts one exactly at the limit', async () => {
    expect((await readImageFile(fileOf(MAX_IMAGE_BYTES))).ok).toBe(true)
  })

  // A PDF or a document renamed to .jpg. The type is what the picker reports, so this is
  // a correctness check rather than a security boundary -- the endpoint checks again.
  it('refuses something that is not an image', async () => {
    const result = await readImageFile(fileOf(64, 'application/pdf', 'brief.pdf'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/photo|image/i)
  })

  it('accepts what a phone camera actually produces', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect((await readImageFile(fileOf(64, type))).ok, type).toBe(true)
    }
  })

  it('refuses an empty file rather than sending nothing', async () => {
    expect((await readImageFile(fileOf(0))).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/image.test.ts`
Expected: FAIL — cannot resolve `./image`.

- [ ] **Step 3: Add the constants**

Append to `src/ai/types.ts`:

```ts
/**
 * Groq's limit for a base64 image payload. Enforced in the browser as well as the server
 * so an oversized photo is refused before it is uploaded on a student's mobile data.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/** What a phone camera actually produces. HEIC is here because iPhones default to it, and
 *  leaving it out would refuse the most common camera in the room. */
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const

/** What came back from a photo, or why nothing did. A photograph has no honest rule-based
 *  fallback, so "why not" is a first-class outcome here rather than an error. */
export type PhotoOutcome =
  | { readonly ok: true; readonly items: readonly ParsedItem[] }
  | { readonly ok: false; readonly reason: string }
```

- [ ] **Step 4: Implement**

`src/ai/image.ts`:

```ts
import { ACCEPTED_TYPES, MAX_IMAGE_BYTES } from './types'

export { ACCEPTED_TYPES, MAX_IMAGE_BYTES }

export type ImageResult =
  | { readonly ok: true; readonly dataUrl: string }
  | { readonly ok: false; readonly reason: string }

/**
 * Turns a chosen file into something sendable, and refuses what it should not accept.
 *
 * Every refusal returns a sentence a student can act on rather than a code. §1.4's whole
 * stance is that a student cannot correct what they were never told, and that applies to
 * an import that never started just as much as to one that read the wrong date.
 */
export async function readImageFile(file: File): Promise<ImageResult> {
  if (!ACCEPTED_TYPES.includes(file.type as (typeof ACCEPTED_TYPES)[number])) {
    return { ok: false, reason: 'That does not look like a photo. Try a JPEG, PNG or HEIC.' }
  }

  if (file.size === 0) {
    return { ok: false, reason: 'That file is empty.' }
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'That photo is too big to send. Try a smaller one.' }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('unreadable'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

  return { ok: true, dataUrl }
}
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck`

```bash
git add src/ai
git commit -m "$(cat <<'EOF'
feat: bound a chosen photo before it costs anything

An oversized image refused at the endpoint has already been uploaded, on
a student's mobile data, to be told no. §10 budgets the whole
interaction rather than the model's half of it, so the limit is checked
in the browser too -- the server checks again, because a browser check
is a courtesy and not a boundary.

Every refusal is a sentence a student can act on rather than a code.
§1.4's stance is that a student cannot correct what they were never
told, and that applies to an import that never started as much as to one
that read the wrong date.

HEIC is in the accepted list because iPhones default to it, and leaving
it out would refuse the most common camera in the room.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: The vision call, and the endpoint holding the key

**Files:**
- Create: `src/ai/vision.ts`, `src/ai/vision.test.ts`, `api/read-photo.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `parseModelReply` from `src/ai/schema.ts` — unchanged, deliberately shared.
- Produces: `function askVision(dataUrl: string, apiKey: string): Promise<ParsedItem[] | null>`

- [ ] **Step 1: Write the failing test**

`src/ai/vision.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { askVision } from './vision'

/**
 * The network is stubbed and the key is a fake string, so nothing here reaches Groq or
 * spends anything. This module is one of two in src/ that takes a credential, so the
 * "key travels in the Authorization header and nowhere else" property is asserted rather
 * than assumed -- the same check groq.test.ts makes.
 */
const PHOTO = 'data:image/jpeg;base64,AAAA'

const reply = (content: string) => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content } }] }),
})

const good = JSON.stringify({
  items: [{ title: 'WIA3001 report', type: 'mental', hours: 8, deadlineDay: 9, hard: true }],
})

afterEach(() => vi.unstubAllGlobals())

describe('askVision', () => {
  it('returns the validated items a photo produced', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(good)))

    const items = await askVision(PHOTO, 'test-key-not-real')

    expect(items).toHaveLength(1)
    expect(items?.[0]?.title).toBe('WIA3001 report')
  })

  it('sends the key in the authorization header and nowhere else', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askVision(PHOTO, 'test-key-not-real')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['authorization']).toContain(
      'test-key-not-real',
    )
    expect(url).not.toContain('test-key-not-real')
    expect(String(init.body)).not.toContain('test-key-not-real')
  })

  it('sends the photo itself', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(reply(good))
    vi.stubGlobal('fetch', fetchSpy)

    await askVision(PHOTO, 'test-key-not-real')

    expect(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).toContain(PHOTO)
  })

  // Shared with the planner on purpose: one schema, so a vision reply cannot become the
  // unchecked path by drifting away from a second copy.
  it('gives up when the reply fails the planner schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply(JSON.stringify({ items: [{ title: 'x', type: 'made-up' }] }))),
    )

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the model answers in prose', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply('I can see an assignment brief!')))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the API refuses the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413 }))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the reply carries no content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  it('gives up when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    expect(await askVision(PHOTO, 'test-key-not-real')).toBeNull()
  })

  // §10, constraint 3. An image takes longer than text, so the budget is larger -- but a
  // model that accepts the photo and never answers must not hold the screen forever.
  it('gives up on a model that never answers, rather than hanging', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      ),
    )

    const pending = askVision(PHOTO, 'test-key-not-real')
    await vi.advanceTimersByTimeAsync(20000)

    expect(await pending).toBeNull()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/vision.test.ts`
Expected: FAIL — cannot resolve `./vision`.

- [ ] **Step 3: Implement the vision call**

`src/ai/vision.ts`:

```ts
import { HORIZON_DAYS } from '../engine'
import { parseModelReply } from './schema'
import { MAX_ITEMS, type ParsedItem } from './types'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

/** Groq's current vision-capable model. */
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

/** Longer than the planner's eight seconds, because an image is far more to process --
 *  still bounded, per §10's third constraint. */
const VISION_TIMEOUT_MS = 20000

/**
 * §1.4's photo-of-anything entry point is in the prompt rather than in code: the model does
 * the identifying, so the instruction has to permit a brief, a planner page, a whiteboard
 * or a slide without branching on which it got.
 */
const SYSTEM_PROMPT = [
  'You read a photograph of a student\'s work and turn it into a task list.',
  'It may be an assignment brief, a handwritten planner page, a whiteboard, a lecture',
  'slide, a roster or a sticky note. Read whatever is actually there.',
  'Reply with JSON only, shaped {"items":[{"title","type","hours","deadlineDay","hard"}]}.',
  'type is one of: mental, physical, social, errands.',
  'hours is your estimate of effort, between 0 and 24. Use stated word counts or',
  'weightings where the page gives them.',
  `deadlineDay is a day index from 0 (today) to ${HORIZON_DAYS - 1}, or null if the page`,
  'does not state one. hard is true only where a fixed date is actually printed.',
  `Return at most ${MAX_ITEMS} items.`,
  // The rule that matters most. A model filling in a plausible deadline produces exactly
  // the silent-poisoning failure §1.4 exists to prevent, and the student cannot debug it.
  'Never invent a task, a date or a number that is not visible in the image.',
].join(' ')

/**
 * One of the two places a Groq key is used, and only ever reached from `api/`.
 *
 * The reply goes through the planner's own schema rather than a second copy: one schema
 * means a vision reply cannot quietly become the unvalidated path by drifting away from it.
 */
export async function askVision(dataUrl: string, apiKey: string): Promise<ParsedItem[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this picture? Return the JSON.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    })

    if (!response.ok) return null

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = body.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    return parseModelReply(JSON.parse(content))
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 4: Write the endpoint**

`api/read-photo.ts`:

```ts
import { askVision } from '../src/ai/vision'
import { MAX_IMAGE_BYTES } from '../src/ai/types'

/** Matches api/plan.ts: the web-standard handler signature, declared rather than inferred
 *  because the wrong runtime fails only once deployed. */
export const config = { runtime: 'edge' }

/** A data URL for one of the types the picker accepts. Checked here as well as in the
 *  browser, because the browser check is a courtesy and this one is the boundary. */
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp|heic);base64,[A-Za-z0-9+/=]+$/

/**
 * The second place `GROQ_API_KEY` is read, and the second thing on the far side of §10's
 * key boundary.
 *
 * With no key it answers 503, and unlike the planner the client has nothing to fall back
 * to -- so the 503 becomes a sentence explaining that reading a photo needs the model.
 * There is no honest rule-based substitute for reading an image, and inventing one would
 * mean inventing tasks that are not in the picture: precisely the failure §1.4's
 * never-import-silently rule exists to prevent.
 */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return new Response('Photo reading unavailable', { status: 503 })

  let image: unknown
  try {
    image = ((await request.json()) as { image?: unknown }).image
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (typeof image !== 'string' || !IMAGE_DATA_URL.test(image)) {
    return new Response('Bad request', { status: 400 })
  }

  // The same cap the browser applies, enforced where it counts. A base64 payload is about
  // four thirds of the bytes it encodes, so this compares like with like.
  if (image.length > MAX_IMAGE_BYTES * 1.4) {
    return new Response('Image too large', { status: 413 })
  }

  const items = await askVision(image, apiKey)
  if (items === null) return new Response('Photo reading unavailable', { status: 503 })

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
```

- [ ] **Step 5: Note the shared key**

In `.env.example`, extend the `GROQ_API_KEY` comment:

```
# Read only by api/plan.ts and api/read-photo.ts. Leave it unset and the planner falls back
# to its rule-based parser; photo import has no fallback and says so plainly instead.
```

- [ ] **Step 6: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck && npm run build`

Then verify the credential never reaches the bundle, as PR #21 did:

```bash
grep -rl "api.groq.com" dist/ && echo "LEAK" || echo "OK: no model URL in the bundle"
grep -rl "GROQ_API_KEY" dist/ && echo "LEAK" || echo "OK: no key reference in the bundle"
```

```bash
git add src/ai api .env.example
git commit -m "$(cat <<'EOF'
feat: read a photo with a vision model, key still off the browser

§1.4's primary input path, on the far side of §10's key boundary:
api/read-photo.ts is the second and last place GROQ_API_KEY is read.

The reply goes through the planner's own schema rather than a second
copy. One schema means a vision reply cannot quietly become the
unvalidated path by drifting away from a duplicate -- and it is why a
photographed brief produces exactly the items a typed brain dump does,
so the confirm chips and the placement code are reused rather than
rebuilt.

The photo-of-anything entry point lives in the prompt rather than in
branching code: the model does the identifying, so the instruction
permits a brief, a planner page, a whiteboard or a slide without the
code needing to know which it got.

The prompt's most important line forbids inventing a task, a date or a
number not visible in the image. A model filling in a plausible deadline
is exactly the silent poisoning §1.4 exists to prevent, and it is the
failure a student is least able to debug.

The data URL is validated at the endpoint as well as in the browser: the
browser check is a courtesy, this one is the boundary.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Asking, and saying why when it cannot

**Files:**
- Create: `src/ai/readPhoto.ts`, `src/ai/readPhoto.test.ts`
- Modify: `src/ai/index.ts`

**Interfaces:**
- Consumes: `readImageFile` (Task 1).
- Produces: `function readPhoto(file: File): Promise<PhotoOutcome>`

- [ ] **Step 1: Write the failing test**

`src/ai/readPhoto.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPhoto } from './readPhoto'

const photo = (bytes = 64, type = 'image/jpeg') =>
  new File([new Uint8Array(bytes)], 'brief.jpg', { type })

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('readPhoto', () => {
  it('returns what the model read', async () => {
    respondWith(200, {
      items: [{ title: 'WIA3001 report', type: 'mental', hours: 8, deadlineDay: 9, hard: true }],
    })

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.items[0]?.title).toBe('WIA3001 report')
  })

  /**
   * The design decision this unit exists for. A photograph has no honest rule-based
   * fallback -- reading an image needs the model, and guessing at contents would mean
   * inventing tasks that are not in the picture. So the answer is a sentence, and it
   * points at the path that always works.
   */
  it('says plainly that reading a photo needs the model when none is configured', async () => {
    respondWith(503, {})

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/photo/i)
      // Points somewhere useful rather than leaving the student stuck.
      expect(outcome.reason).toMatch(/typ/i)
    }
  })

  it('says so when the network fails, without a technical error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).not.toMatch(/fetch|undefined|error:/i)
  })

  it('passes a refusal from the file check straight through', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const outcome = await readPhoto(photo(64, 'application/pdf'))

    expect(outcome.ok).toBe(false)
    // Refused locally: a file we already know is wrong costs no upload.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('treats a reply it cannot validate as a failure, not as an empty week', async () => {
    respondWith(200, { items: [{ title: 'x', type: 'invented' }] })

    expect((await readPhoto(photo())).ok).toBe(false)
  })

  // A photo of a blank wall. Nothing found is a real answer, and different from a failure.
  it('reports finding nothing as a success with nothing in it', async () => {
    respondWith(200, { items: [] })

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.items).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ai/readPhoto.test.ts`
Expected: FAIL — cannot resolve `./readPhoto`.

- [ ] **Step 3: Implement**

`src/ai/readPhoto.ts`:

```ts
import { readImageFile } from './image'
import { parseModelReply } from './schema'
import type { PhotoOutcome } from './types'

/**
 * Why there is no fallback here, stated once so nobody adds one later.
 *
 * The planner degrades to a rule-based parser because text can be read by rules. An image
 * cannot. Any "fallback" for a photograph would have to invent tasks that are not in the
 * picture, which is the exact failure §1.4's never-import-silently rule exists to prevent
 * -- worse than no feature, because it is wrong in a way the student cannot see.
 *
 * So the honest answer is a sentence, and it points at the typing path, which always works.
 */
const UNAVAILABLE =
  'I could not read that photo. Reading photos needs the model to be set up — you can type it out instead, which always works.'

export async function readPhoto(file: File): Promise<PhotoOutcome> {
  const image = await readImageFile(file)
  if (!image.ok) return { ok: false, reason: image.reason }

  try {
    const response = await fetch('/api/read-photo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: image.dataUrl }),
    })

    if (response.ok) {
      const items = parseModelReply(await response.json())
      // A reply that fails validation is a failure, not an empty week: telling a student
      // their brief contained nothing would be a lie they would act on.
      if (items !== null) return { ok: true, items }
    }
  } catch {
    // No endpoint, or no network. Same sentence either way.
  }

  return { ok: false, reason: UNAVAILABLE }
}
```

Add to `src/ai/index.ts`:

```ts
export { readPhoto } from './readPhoto'
export { readImageFile, ACCEPTED_TYPES, MAX_IMAGE_BYTES } from './image'
export type { PhotoOutcome } from './types'
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ai && npm run typecheck`

```bash
git add src/ai
git commit -m "$(cat <<'EOF'
feat: read a photo, or say honestly why it could not

The planner degrades to a rule-based parser because text can be read by
rules. An image cannot, and any "fallback" for a photograph would have
to invent tasks that are not in the picture -- the exact failure §1.4's
never-import-silently rule exists to prevent, and worse than no feature
because it is wrong in a way the student cannot see.

So the answer is a sentence rather than a guess or a stack trace, and it
points at the typing path, which always works. Stated in a comment at
the top of the module as well as in the behaviour, so nobody adds a
fallback later thinking it was an oversight.

A reply that fails validation is a failure, not an empty week. Telling a
student their brief contained nothing would be a lie they would act on.
A photo that genuinely contains nothing is a success with nothing in it,
and the two are kept distinct.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: The confirm screen, with the photo beside it

**Files:**
- Create: `src/ui/planner/PhotoImportScreen.tsx`, `src/ui/planner/PhotoImportScreen.test.tsx`

**Interfaces:**
- Consumes: `ItemChip` from `src/ui/planner/ItemChip.tsx`, unchanged.
- Produces: `function PhotoImportScreen(props: { onAccept: (items: readonly ParsedItem[]) => void; onCancel: () => void }): JSX.Element`

- [ ] **Step 1: Write the failing test**

`src/ui/planner/PhotoImportScreen.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoImportScreen } from './PhotoImportScreen'

const good = {
  items: [
    { title: 'WIA3001 report', type: 'mental', hours: 8, deadlineDay: 9, hard: true },
    { title: 'Group presentation', type: 'social', hours: 3, deadlineDay: 5, hard: true },
  ],
}

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

const photo = () => new File([new Uint8Array(64)], 'brief.jpg', { type: 'image/jpeg' })

beforeEach(() => respondWith(503, {}))
afterEach(() => vi.unstubAllGlobals())

const setup = () => {
  const props = { onAccept: vi.fn(), onCancel: vi.fn() }
  render(<PhotoImportScreen {...props} />)
  return props
}

const choose = async () => {
  await userEvent.upload(screen.getByTestId('photo-input'), photo())
}

describe('PhotoImportScreen', () => {
  it('starts with nothing read and nothing to accept', () => {
    setup()

    expect(screen.queryByRole('button', { name: /add these/i })).toBeNull()
  })

  it('turns a photo into chips', async () => {
    respondWith(200, good)
    setup()

    await choose()

    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))
  })

  /**
   * §1.4 matters more here than in the planner. A student wrote their own brain dump and
   * remembers it; they may never have read the brief closely, so a misread deadline is
   * both likelier and less likely to be caught. The photo stays on screen to be checked
   * against.
   */
  it('shows the photo beside what it read', async () => {
    respondWith(200, good)
    setup()

    await choose()

    await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeVisible())
  })

  it('describes the photo for a screen reader rather than leaving it unlabelled', async () => {
    respondWith(200, good)
    setup()

    await choose()

    await waitFor(() =>
      expect(screen.getByTestId('photo-preview')).toHaveAccessibleName(/photo|brief/i),
    )
  })

  it('accepts nothing until the student says so', async () => {
    respondWith(200, good)
    const props = setup()

    await choose()
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    expect(props.onAccept).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ title: 'WIA3001 report' })]),
    )
  })

  it('drops an item the student removed', async () => {
    respondWith(200, good)
    const props = setup()

    await choose()
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!)
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Group presentation' }),
    ])
  })

  // Unit 4's whole point, at the surface a student actually meets.
  it('explains itself when reading a photo is not available', async () => {
    setup()

    await choose()

    expect(await screen.findByTestId('photo-problem')).toHaveTextContent(/type it out/i)
  })

  it('says so when the file is not a photo at all', async () => {
    setup()

    await userEvent.upload(
      screen.getByTestId('photo-input'),
      new File([new Uint8Array(64)], 'brief.pdf', { type: 'application/pdf' }),
    )

    expect(await screen.findByTestId('photo-problem')).toHaveTextContent(/photo/i)
  })

  it('can be left without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(props.onAccept).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/planner/PhotoImportScreen.test.tsx`
Expected: FAIL — cannot resolve `./PhotoImportScreen`.

- [ ] **Step 3: Implement**

`src/ui/planner/PhotoImportScreen.tsx`:

```tsx
import { useState } from 'react'
import type { ParsedItem } from '../../ai'
import { ItemChip } from './ItemChip'

/**
 * §1.4's primary input path: one button, camera or gallery, and the model works out what it
 * is looking at.
 *
 * `capture` is deliberately absent from the input. With it, a laptop offers a webcam and
 * nothing else; without it, a phone still offers the camera alongside the gallery, and a
 * laptop offers the file picker -- which is the machine this gets demonstrated on.
 */
export function PhotoImportScreen({
  onAccept,
  onCancel,
}: {
  onAccept: (items: readonly ParsedItem[]) => void
  onCancel: () => void
}) {
  const [items, setItems] = useState<ParsedItem[] | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [reading, setReading] = useState(false)

  async function onChoose(file: File | undefined) {
    if (!file) return

    setReading(true)
    setProblem(null)
    setItems(null)

    try {
      const { readPhoto, readImageFile } = await import('../../ai')

      // Read once for the preview so the student has something to check against even when
      // the reading itself fails -- seeing the photo is how they tell a bad shot from a
      // missing key.
      const image = await readImageFile(file)
      setPreview(image.ok ? image.dataUrl : null)

      const outcome = await readPhoto(file)
      if (outcome.ok) setItems([...outcome.items])
      else setProblem(outcome.reason)
    } finally {
      setReading(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Photograph it</h1>
        <p className="text-sm opacity-70">
          An assignment brief, your planner page, a whiteboard, a slide with dates on it.
        </p>
      </header>

      <label className="flex flex-col gap-2 text-sm">
        <span>Choose a photo</span>
        <input
          type="file"
          accept="image/*"
          data-testid="photo-input"
          disabled={reading}
          onChange={(event) => void onChoose(event.target.files?.[0])}
          className="rounded-lg border border-slate-300 p-3"
        />
      </label>

      {reading && <p className="text-sm opacity-80">Reading it…</p>}

      {problem !== null && (
        <p data-testid="photo-problem" role="status" className="text-sm text-amber-900">
          {problem}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-3 underline">
          Cancel
        </button>
      </div>

      {/* §1.4: the photo stays beside what was read, so a misread date can be caught
          against the page it came from. Stacks below the chips at phone width. */}
      <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-start">
        {preview !== null && (
          <img
            src={preview}
            alt="The photo you chose"
            data-testid="photo-preview"
            className="max-h-64 w-full rounded-lg object-contain sm:w-48"
          />
        )}

        {items !== null && items.length > 0 && (
          <ul className="flex flex-1 flex-col gap-3">
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
        )}
      </div>

      {items !== null && items.length === 0 && (
        <p className="text-sm opacity-80">I could not find anything to do in that photo.</p>
      )}

      {items !== null && items.length > 0 && (
        <button
          type="button"
          onClick={() => onAccept(items)}
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white sm:w-auto"
        >
          Add these to my week
        </button>
      )}
    </main>
  )
}
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ui/planner && npm run typecheck`

```bash
git add src/ui/planner
git commit -m "$(cat <<'EOF'
feat: confirm what a photo said, with the photo still on screen

§1.4's confirm rule matters more here than in the planner. A student
wrote their own brain dump and remembers it; they may never have read
the brief closely, so a misread deadline is both likelier and less
likely to be caught. The photo stays beside the chips to be checked
against, and it is shown even when the reading fails -- seeing the shot
is how a student tells a blurry photo from a missing key.

The chips are the planner's, unchanged. A photographed brief produces
the same items a typed dump does, so the confirm gate did not need
rebuilding.

`capture` is deliberately absent from the file input: with it a laptop
offers a webcam and nothing else, and this has to be demonstrable on the
machine it will be judged on. Without it a phone still offers the camera
alongside the gallery.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: The second way in

**Files:**
- Modify: `src/ui/HomeScreen.tsx`
- Create: `src/ui/HomeScreen.photo.test.tsx`, `tests/e2e/photo.spec.ts`

**Interfaces:**
- Consumes: `addItems` from `src/domain/addItems.ts`, unchanged.

- [ ] **Step 1: Write the failing test**

`src/ui/HomeScreen.photo.test.tsx`: mirror `HomeScreen.planner.test.tsx` — render with a
fresh `createLocalRepository(\`photo-screen-${counter}\`)`, stub `fetch` to answer 200 with
one item, click `open-photo`, upload a file, accept, and assert the saved week has it. Plus
one test that cancelling changes nothing, and one that the entry point is visible.

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { HomeScreen } from './HomeScreen'

const emptyWeek = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          items: [
            { title: 'WIA3001 report', type: 'mental', hours: 8, deadlineDay: 9, hard: true },
          ],
        }),
    }),
  ),
)
afterEach(() => vi.unstubAllGlobals())

let counter = 0

const renderHome = async () => {
  counter += 1
  const repository = createLocalRepository(`photo-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(emptyWeek())

  render(<HomeScreen repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('open-photo')).toBeVisible())

  return repository
}

describe('HomeScreen with photo import', () => {
  it('offers photographing something as a second way in', async () => {
    await renderHome()

    expect(screen.getByTestId('open-photo')).toBeVisible()
  })

  it('comes back without changing anything when cancelled', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('open-photo'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  it('accepted items from a photo reach the saved week', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('open-photo'))
    await userEvent.upload(
      screen.getByTestId('photo-input'),
      new File([new Uint8Array(64)], 'brief.jpg', { type: 'image/jpeg' }),
    )
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))
    expect(screen.getByTestId('room-scene')).toBeVisible()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/ui/HomeScreen.photo.test.tsx`
Expected: FAIL — no `open-photo` element.

- [ ] **Step 3: Wire it in**

In `src/ui/HomeScreen.tsx`: import `PhotoImportScreen`; add
`const [photographing, setPhotographing] = useState(false)`; add a branch beside the
`planning` one:

```tsx
  if (photographing) {
    return (
      <PhotoImportScreen
        onAccept={(items) => {
          setSchedule(addItems(schedule, items))
          setPhotographing(false)
        }}
        onCancel={() => setPhotographing(false)}
      />
    )
  }
```

and a button beside "Tell me what you are carrying":

```tsx
        {/* §1.4 ranks the camera above typing, so it sits alongside rather than buried. */}
        <button
          type="button"
          onClick={() => setPhotographing(true)}
          data-testid="open-photo"
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-base sm:w-auto"
        >
          Photograph a brief or a planner page
        </button>
```

- [ ] **Step 4: Add the browser test**

`tests/e2e/photo.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

/**
 * No key is configured for this suite and `npm run preview` never serves /api, so what
 * this proves is the honest-refusal path: a student on a machine with no model set up is
 * told what happened and where to go instead, rather than meeting a dead button or a
 * stack trace.
 *
 * The successful reading cannot be driven here without a live model and a real cost per
 * run. That gap is stated in the pull request rather than papered over.
 */
async function openPhoto(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await page.getByTestId('open-photo').click()
}

test('says what happened when reading a photo is not available', async ({ page }) => {
  await openPhoto(page)

  await page.getByTestId('photo-input').setInputFiles({
    name: 'brief.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
  })

  await expect(page.getByTestId('photo-problem')).toContainText(/type it out/i)
})

test('shows the photo even when the reading failed', async ({ page }) => {
  await openPhoto(page)

  await page.getByTestId('photo-input').setInputFiles({
    name: 'brief.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
  })

  await expect(page.getByTestId('photo-preview')).toBeVisible()
})

for (const width of [320, 390, 768, 1280]) {
  test(`photo import fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openPhoto(page)

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
```

- [ ] **Step 5: Run everything**

```bash
npm run typecheck
npm run test:coverage
npm run build
PORT=5199 npx playwright test --workers=1
```

Expected: all pass. If coverage dips below 97 / 91 / 97 / 98, add tests rather than
lowering the thresholds. Use `--workers=1` and a free port while the sibling worktree is
running — parallel runs on a contended machine time out at 30s and fail tests that are
actually fine.

Then re-check the bundle:

```bash
grep -rl "api.groq.com\|GROQ_API_KEY" dist/ && echo "LEAK" || echo "OK"
```

- [ ] **Step 6: Commit**

```bash
git add src tests
git commit -m "$(cat <<'EOF'
feat: offer the camera as a second way into the week

§1.4 ranks the camera above typing, because deadlines cause the pile-up
and a brief is where the deadlines are. So it sits alongside "tell me
what you are carrying" rather than buried behind it.

Accepted items go through addItems unchanged, which is what keeps the
guarantee that nothing arriving from a model can create protected rest
or pin a block -- the same code path, so the same proof.

The browser test covers the honest-refusal path, because no key is
configured for that suite and preview never serves /api. The successful
reading cannot be driven there without a live model and a real cost per
run; that gap is stated rather than papered over.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| §1.4 assignment brief OCR (deadlines, weightings, word counts) | 2 (prompt), 4 (confirm) |
| §1.4 photo-of-anything entry point | 2 — in the prompt, so no branching per document type |
| §1.4 one button, camera or gallery | 4 |
| §1.4 never import silently; confirm screen; low-confidence flagged; one-tap correction | 4 (chips reused; flag already built and tested) |
| §10 constraint 1: no key in the browser | 2 |
| §10 constraint 3: time-boxed call | 2 |
| Untrusted input validated at the boundary | 2 — the planner's schema, shared not copied |
| Model may propose, never originate authority | 5 — `addItems` unchanged |
| §11 responsive at four widths | 5 |
| §1.4 timetable OCR | **Not built.** §11: "high value if time allows". |
| §1.4 Google Calendar | **Not built.** §11 defers it, and §1.4 flags it as needing a team decision that has not been made. |
| §1.4 semester dates at import | **Not built.** Belongs with timetable OCR's recurring load. |

**Placeholder scan:** none.

**Type consistency:** `PhotoOutcome` and `ImageResult` are defined in Task 1 and consumed
unchanged in 3 and 4. `askVision(dataUrl, apiKey) -> ParsedItem[] | null` matches between
Task 2's definition and `api/read-photo.ts`. `readPhoto(file) -> PhotoOutcome` matches
between Task 3 and Task 4. `ItemChip`'s props are used exactly as `PlannerScreen.tsx` uses
them.

**Three risks recorded:**

1. **The vision model id may be wrong or retired.** `meta-llama/llama-4-scout-17b-16e-instruct`
   is Groq's current vision model at time of writing, but this is the one value in the plan
   that cannot be checked without a live call. If the manual check returns a model error,
   the fix is the constant in `src/ai/vision.ts` and nothing else.
2. **The successful photo path has no automated coverage.** By design — see Task 5's browser
   test comment — but it means a regression in the vision call itself would be caught only
   by hand. The schema, the bounds, the refusal path and the chips are all covered.
3. **HEIC may not render in the preview.** Browsers accept HEIC uploads but Chrome does not
   display it in an `<img>`. The reading still works; the preview may be blank on an iPhone
   photo. Worth checking by hand, and if it bites, the fix is to say so under the preview
   rather than to silently drop HEIC from the accepted list.
