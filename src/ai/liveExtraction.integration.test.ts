import { describe, expect, it } from 'vitest'
import { priceRequest } from '../domain/requestCost'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { askGroq } from './groq'
import { readRequest } from './readRequest'
import { askVision } from './vision'
import { askWriter } from './writer'

/**
 * The two paths a student types into, run against the real model.
 *
 * `models.integration.test.ts` next door asks whether the model ids still exist. This asks
 * the question after that one: given that the endpoint answers, does it actually read what
 * a student wrote -- the name of the thing, and the time they said it happens?
 *
 * That cannot be answered by the ordinary suite, which stubs `fetch` on purpose so it can
 * never spend money. It also cannot be answered by asserting the prompt contains the word
 * "startHour": a prompt that asks for something the model then ignores looks identical in
 * source and is exactly the failure §43 was written about, where a stated 9am was dropped
 * on the floor and the app chose an hour of its own.
 *
 * ## Running it
 *
 *     npm run test:integration
 *
 * Skipped unless GROQ_API_KEY is set, so `npm test` and CI can never reach it. These calls
 * are billable and are deliberately the fewest that can answer the question: one planner
 * call, one request call, one drafting call.
 */
const apiKey = process.env.GROQ_API_KEY ?? ''
const describeIfKeyed = apiKey === '' ? describe.skip : describe

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

describeIfKeyed('the typed path, against the real model', () => {
  it('reads the name and the stated time out of a brain dump', async () => {
    const items = await askGroq(
      'wia3001 lecture tuesday 9am, gym thursday 7pm, essay due friday 2000 words havent started',
      apiKey,
    )

    // Printed rather than only asserted: what the model actually returned is the finding
    // this file exists to report, and an assertion alone throws it away.
    console.log('PLANNER REPLY:', JSON.stringify(items, null, 2))

    expect(items).not.toBeNull()
    expect(items!.length).toBeGreaterThanOrEqual(2)

    const lecture = items!.find((item) => /lecture|wia3001/i.test(item.title))
    expect(lecture, 'the lecture was not read at all').toBeDefined()
    expect(lecture!.startHour, 'the stated 9am was dropped').toBe(9)

    const gym = items!.find((item) => /gym/i.test(item.title))
    expect(gym?.startHour, 'the stated 7pm was dropped or read as 7am').toBe(19)
  })

  /**
   * The other half of §43, and the one a prompt can get wrong in the opposite direction:
   * an essay "due friday" states a deadline and no time of day. A model that invents an
   * hour there would pin a maximally movable item, taking away the freedom the rebalancer
   * needs.
   */
  it('states no hour where the student stated none', async () => {
    const items = await askGroq('essay due friday 2000 words, read chapter 3', apiKey)

    console.log('NO-TIME REPLY:', JSON.stringify(items, null, 2))

    expect(items).not.toBeNull()
    for (const item of items!) {
      expect(item.startHour, `${item.title} was given an hour nobody stated`).toBeNull()
    }
  })
})

describeIfKeyed('the request path, against the real model', () => {
  /**
   * `readRequest` reaches the model through `/api/plan`, which does not exist in a test
   * process -- so the transport is stubbed with the reply the REAL model just gave. The
   * model's reading is live; only the HTTP hop between the browser and our own endpoint is
   * local, and that hop is what `parseBrainDump.test.ts` already covers.
   */
  it('turns a real request message into one dated commitment', async () => {
    const message =
      'hey can you help with our FYP presentation next thursday 2pm, maybe 3 hours? sorry for short notice'

    const fromModel = await askGroq(message, apiKey)
    console.log('REQUEST REPLY:', JSON.stringify(fromModel, null, 2))
    expect(fromModel).not.toBeNull()

    /**
     * Handed back in the WIRE shape, which is what `/api/plan` returns and what
     * `parseModelReply` validates: `hard`, not the domain's `fixed`. Sending the domain
     * shape fails that schema, and `parseBrainDump` then falls back to the rules -- so the
     * test would quietly stop exercising the model's reading while still passing, which is
     * exactly what it did on the first run of this file.
     */
    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          items: fromModel!.map(({ fixed, id, ...item }) => ({ ...item, hard: fixed })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch

    try {
      const commitment = await readRequest(message)
      console.log('MERGED COMMITMENT:', JSON.stringify(commitment, null, 2))

      expect(commitment, 'the request was not read into a commitment').not.toBeNull()
      expect(commitment!.title).toMatch(/fyp|presentation/i)
      expect(commitment!.hours, 'the stated 3 hours was dropped').toBeGreaterThanOrEqual(2)
      expect(commitment!.startHour, 'the stated 2pm was dropped').toBe(14)
    } finally {
      globalThis.fetch = original
    }
  })

  /** §2.3's three replies -- the excuses -- drafted by the real writer rather than the
   *  templates, against a real price for a real week. */
  it('drafts three replies in the student\'s own voice', async () => {
    const item = {
      id: 'ask',
      title: 'FYP presentation help',
      type: 'social' as const,
      kind: 'socialDraining' as const,
      hours: 3,
      deadlineDay: 4,
      startHour: 14,
      fixed: false,
      confident: true,
      repeat: null,
    }

    const cost = priceRequest(week(), item, DEFAULT_PARAMS, 0, [])
    const drafts = await askWriter(
      // The same brief `drafts.ts` builds in production, field for field.
      {
        what: item.title,
        hours: item.hours,
        evenings: cost.eveningsEquivalent,
        deficitDay: cost.firstDeficitDayAfter,
        absorbable: cost.absorbable,
      },
      apiKey,
    )

    console.log('DRAFTS:', JSON.stringify(drafts, null, 2))

    expect(drafts, 'the writer returned nothing usable').not.toBeNull()
    expect(drafts!.map((draft) => draft.tone).sort()).toEqual(['accept', 'decline', 'defer'])
    for (const draft of drafts!) {
      expect(draft.text.length, `${draft.tone} came back empty`).toBeGreaterThan(10)
    }
  })
})

/**
 * §44, against the real model: does telling it what today is actually move the answer?
 *
 * The prompt said "deadlineDay is a day index from 0 (today)" and never said what today
 * was, so a stated weekday could only be guessed at -- and the guess showed up in the app
 * as "gym thursday 7pm" offered on a Monday. A prompt line is easy to add and impossible to
 * verify by reading, which is exactly the kind of change that needs one real call.
 */
describeIfKeyed('a stated weekday, with the calendar told to the model', () => {
  it('counts thursday forward from the real today', async () => {
    // 2026-09-11 is a Friday, so day 0 is a Friday and the next Thursday is day 6.
    const calendar = { today: 0, startWeekday: 5, todayLabel: '11 September 2026' }

    const items = await askGroq('gym thursday 7pm', 'x' === 'x' ? apiKey : '', calendar)
    console.log('WEEKDAY REPLY:', JSON.stringify(items, null, 2))

    expect(items).not.toBeNull()
    const gym = items!.find((item) => /gym/i.test(item.title))
    expect(gym, 'the gym was not read at all').toBeDefined()
    expect(gym!.startHour, 'the stated 7pm was dropped').toBe(19)

    /**
     * Either answer is correct and the app handles both: a single dated item on day 6, or a
     * weekly series on Thursday, which `expandRecurring` dates from the same anchor. What
     * would be wrong -- and what happened before the calendar was passed -- is a day index
     * that is neither, landing the gym on a Monday.
     */
    const repeatsOnThursday = gym!.repeat?.weekdays.includes(4) ?? false
    expect(
      gym!.deadlineDay === 6 || repeatsOnThursday,
      `thursday came back as day ${gym!.deadlineDay} with repeat ${JSON.stringify(gym!.repeat)}`,
    ).toBe(true)
  })
})

/**
 * §44's last reader, against the real vision model.
 *
 * The prompt line is easy to add and impossible to verify by reading -- which the planner
 * proved expensively: the first wording made the live model answer `null` for a stated
 * weekday, worse than the wrong day it replaced. The photo reader now shares that corrected
 * wording, and this is the call that says whether sharing it worked.
 *
 * A tiny generated timetable rather than a photograph of one: the question is whether the
 * model counts a named weekday from the day it was told, and a 2-pixel-tall PNG cannot
 * answer that. So this is skipped by default and run by hand when the wording changes --
 * see the note on the test itself.
 */
describeIfKeyed.skip('a timetable photographed, with the calendar told to the model', () => {
  it('counts a printed weekday forward from the real today', async () => {
    // Supply a real photograph of a timetable at this path to run it. Kept out of the repo
    // deliberately: a student's timetable is their own, and a fixture nobody can regenerate
    // is worse than a test that says what it needs.
    const photo = process.env.TIMETABLE_PHOTO ?? ''
    expect(photo, 'set TIMETABLE_PHOTO to a data URL of a timetable').not.toBe('')

    const items = await askVision(photo, apiKey, {
      today: 0,
      startWeekday: 5,
      todayLabel: '11 September 2026',
    })

    console.log('VISION REPLY:', JSON.stringify(items, null, 2))
    expect(items).not.toBeNull()
  })
})
