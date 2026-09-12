import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS, type BlockKind } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'
import { freeSlotOn, prescribe } from './prescribe'
import { RHYTHM_KINDS } from './softDeadlines'

const item = (over: Partial<ScheduledItem> = {}): ScheduledItem => ({
  id: 'a',
  title: 'Study',
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  intensity: 1,
  dayIndex: 0,
  startHour: 10,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
  ...over,
})

/** A block whose only purpose is to occupy a stretch of the day in a gap test. */
const block = item

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const TYPE_OF: Record<string, 'mental' | 'physical' | 'social'> = {
  rest: 'mental',
  lightExercise: 'physical',
  hardExercise: 'physical',
  socialRestorative: 'social',
}

/**
 * Parked at the far end of the horizon.
 *
 * Enough to stop a rhythm reading as absent -- `missedSoftDeadlines` only reports one with
 * nothing scheduled at or after today -- while never eating the gap on today, which is a
 * separate thing several of these tests measure.
 */
const PARKED_DAY = HORIZON_DAYS - 1

const parked = (kind: BlockKind): ScheduledItem =>
  item({ id: kind, kind, type: TYPE_OF[kind] ?? 'mental', dayIndex: PARKED_DAY, startHour: 20, hours: 1 })

/** A fortnight where exactly one rhythm is being neglected. */
const onlyNeglecting = (kind: BlockKind, over: Partial<Schedule> = {}): Schedule =>
  week({
    ...over,
    items: [
      ...RHYTHM_KINDS.filter((other) => other !== kind).map(parked),
      ...(over.items ?? []),
    ],
  })

/** Everything kept up, so nothing is overdue at all. */
const keepingUp = (over: Partial<Schedule> = {}): Schedule =>
  week({ ...over, items: [...RHYTHM_KINDS.map(parked), ...(over.items ?? [])] })

/** Far enough past every interval that an absent rhythm is unambiguously overdue. */
const LATE = 9

describe('freeSlotOn', () => {
  it('reports a usable slot when the day is empty', () => {
    expect(freeSlotOn(week(), 0)?.hours).toBeGreaterThan(0)
  })

  it('shrinks as the day fills up', () => {
    const busy = week({ items: [item({ hours: 6 }), item({ id: 'b', hours: 6, startHour: 16 })] })

    expect(freeSlotOn(busy, 0)?.hours).toBeLessThan(freeSlotOn(week(), 0)?.hours ?? 0)
  })

  it('never reports a negative-size slot on an overfull day', () => {
    const slot = freeSlotOn(week({ items: [block({ startHour: 0, hours: 24 })] }), 0)

    expect(slot === null || slot.hours >= 0).toBe(true)
  })

  it('places the slot where the gap actually is, not always at 16:00', () => {
    const busyAfternoon = week({ items: [block({ startHour: 15, hours: 4 })] })

    // Not midnight, and not the old hardcoded 16:00 either -- the real free stretch of the
    // student's day starts at the wake hour, since nothing occupies the morning.
    expect(freeSlotOn(busyAfternoon, 0)).toEqual({ startHour: 8, hours: 7 })
  })

  it('never anchors a free slot before the wake hour, even for an ordinary early class', () => {
    // A completely ordinary fixture: one class at 8-10. The scan must not report the
    // midnight-to-8 stretch as free -- nobody is awake for it, and sleepByDay already
    // accounts for it.
    const earlyClass = week({ items: [block({ startHour: 8, hours: 2 })] })

    expect(freeSlotOn(earlyClass, 0)?.startHour).toBeGreaterThanOrEqual(8)
  })

  it('reports no slot when the day has no free hour', () => {
    expect(freeSlotOn(week({ items: [block({ startHour: 0, hours: 24 })] }), 0)).toBeNull()
  })

  it('finds the free hour after the last block when the day starts busy', () => {
    const busyMorning = week({ items: [block({ startHour: 0, hours: 10 })] })

    expect(freeSlotOn(busyMorning, 0)).toEqual({ startHour: 10, hours: 14 })
  })
})

describe('prescribe', () => {
  /**
   * Silence is a real answer. Advice offered to someone who is fine is advice ignored when
   * they are not.
   */
  it('says nothing when nothing is overdue', () => {
    expect(prescribe(keepingUp(), 0, [])).toBeNull()
  })

  /**
   * §5.2's matching, which is the point of the unit. The engine already refuses to let sleep
   * cure loneliness; this is that same conviction pointed at the advice instead of the maths.
   */
  it('prescribes a person when seeing people is what is overdue', () => {
    const out = prescribe(onlyNeglecting('socialRestorative'), LATE, [])

    expect(out?.type).toBe('social')
    expect(out?.kind).toBe('socialRestorative')
    expect(out?.title).toMatch(/someone|person|friend/i)
  })

  it('prescribes movement when moving is what is overdue', () => {
    const out = prescribe(onlyNeglecting('lightExercise'), LATE, [])

    expect(out?.type).toBe('physical')
    expect(out?.title).toMatch(/walk|move|outside/i)
  })

  /**
   * §5.2: "actual downtime, not a different screen". An app suggesting more app is the exact
   * failure this guards against.
   *
   * The check is for a suggestion to *use* something, rather than for the word "screen" at
   * all -- the first version of this test failed on the copy "no screen", which is the
   * advice being asked for rather than a violation of it.
   */
  it('prescribes real downtime when stopping is overdue, not another screen', () => {
    const out = prescribe(onlyNeglecting('rest'), LATE, [])

    expect(out?.type).toBe('mental')
    expect(out?.kind).toBe('rest')
    expect(out?.title).not.toMatch(/watch|browse|scroll|open the app|check your/i)
  })

  // The positive half: it does not merely avoid suggesting a screen, it says to put it down.
  it('tells a depleted student to get off the screen rather than leaving it ambiguous', () => {
    expect(prescribe(onlyNeglecting('rest'), LATE, [])?.title).toMatch(/no screen|off.*screen/i)
  })

  /**
   * The trigger, restated. It used to be the emptiest reserve; it is the longest neglect
   * now, so that "your social reserve is low" and "you have not seen anyone in nine days"
   * cannot arrive on the same day as two separate pieces of news.
   */
  it('answers the longest-running neglect when more than one is overdue', () => {
    // Nothing scheduled at all, so every rhythm is absent. Rest has the shortest interval,
    // so by day 9 it has gone furthest past its own deadline.
    expect(prescribe(week(), LATE, [])?.kind).toBe('rest')
  })

  it('stops prescribing a rhythm the student confirmed they kept up', () => {
    const walked = item({
      id: 'walked',
      kind: 'lightExercise',
      type: 'physical',
      dayIndex: 8,
      hours: 1,
      startHour: 7,
    })

    // Overdue on paper, and confirmed done. A block that happened is not a miss, however
    // late it sat -- which is what stops the app nagging about something already handled.
    const out = prescribe(onlyNeglecting('lightExercise', { items: [walked] }), LATE, [
      { blockId: 'walked', type: 'physical', plannedHours: 1, dayIndex: 8, answer: 'right', answeredAt: 0 },
    ])

    expect(out).toBeNull()
  })

  /**
   * §5.2: one option only. Asserted even though the return type already forbids a list --
   * the type is the guarantee, this test is what explains why it is shaped that way.
   */
  it('returns exactly one thing, never a list', () => {
    const out = prescribe(onlyNeglecting('socialRestorative'), LATE, [])

    expect(Array.isArray(out)).toBe(false)
    expect(out).not.toBeNull()
  })

  it('sizes the suggestion to the gap that actually exists', () => {
    const roomy = prescribe(onlyNeglecting('lightExercise'), LATE, [])
    const packed = prescribe(
      onlyNeglecting('lightExercise', { items: [item({ dayIndex: LATE, hours: 14 })] }),
      LATE,
      [],
    )

    expect(packed?.hours).toBeLessThanOrEqual(roomy?.hours ?? 0)
  })

  /**
   * Past three hours `recoveryForDay` credits nothing, so a longer block would promise
   * recovery the model refuses to pay out.
   */
  it('never suggests a block longer than the engine will credit', () => {
    expect(prescribe(onlyNeglecting('rest'), LATE, [])?.hours).toBeLessThanOrEqual(3)
  })

  it('says nothing when there is no real gap to put it in', () => {
    const packedDay = onlyNeglecting('rest', {
      items: [item({ dayIndex: LATE, startHour: 0, hours: 24 })],
    })

    expect(prescribe(packedDay, LATE, [])).toBeNull()
  })

  /**
   * `ADVICE` has no entry for errands on purpose (see the comment above it), and that
   * absence must not suppress advice for whatever is next-most neglected.
   */
  it('falls through when the worst neglect has no advice of its own', () => {
    const chore = item({
      id: 'chore',
      kind: 'errands',
      type: 'errands',
      dayIndex: LATE,
      hours: 1,
      startHour: 7,
      softDeadlineDay: -50,
    })

    // The errand has run longer than anything else and has no advice of its own. Something
    // still has to be said.
    expect(prescribe(week({ items: [chore] }), LATE, [])?.kind).toBe('rest')
  })

  /**
   * The gate asks whether there is a free hour today; the old insert was hardcoded to 16:00
   * regardless of where that hour actually was, so the card could land on top of a class.
   */
  it('schedules into the gap it found rather than always at 16:00', () => {
    const busyAfternoon = onlyNeglecting('rest', {
      items: [item({ dayIndex: LATE, startHour: 15, hours: 4 })],
    })

    expect(prescribe(busyAfternoon, LATE, [])?.startHour).not.toBe(16)
  })

  it('places it on today rather than on day zero', () => {
    // `today` used to be unavailable here, so day 0 stood in for "now". It is a real
    // argument now, and advice landing on a day already gone is worse than no advice.
    expect(prescribe(onlyNeglecting('rest'), LATE, [])?.dayIndex).toBe(LATE)
  })

  it('places it on a real day within the horizon', () => {
    const out = prescribe(onlyNeglecting('socialRestorative'), LATE, [])

    expect(out?.dayIndex).toBeGreaterThanOrEqual(0)
    expect(out?.dayIndex).toBeLessThan(HORIZON_DAYS)
  })
})

/**
 * Which neglected thing to answer first, when several are overdue.
 *
 * The Reserves sheet put these side by side and the disagreement became impossible to miss:
 * "People is your thinnest, at 43" directly above "Worth doing: stop and do nothing". Both
 * lines were right and they were answering different questions -- the first asks which
 * reserve is lowest, the second asked only which rhythm had gone longest unkept.
 *
 * This does NOT reinstate reserve-driven prescribing, which the docstring above records
 * being deliberately removed: what is neglected still comes entirely from
 * `missedSoftDeadlines`, and a reserve can never conjure a prescription for a rhythm that
 * is being kept. It breaks the tie among things already overdue, which is the one place a
 * reserve level says something the rhythm cannot.
 */
describe('which neglect to answer first', () => {
  const bothNeglected = (over: Partial<Schedule> = {}): Schedule =>
    week({
      ...over,
      items: [
        ...RHYTHM_KINDS.filter(
          (other) => other !== 'rest' && other !== 'socialRestorative',
        ).map(parked),
        ...(over.items ?? []),
      ],
    })

  it('answers the thinnest reserve, where that reserve is one of the neglected ones', () => {
    const prescription = prescribe(bothNeglected(), LATE, [], {
      mental: 70,
      physical: 70,
      social: 43,
      errands: 81,
    })

    expect(prescription?.type).toBe('social')
  })

  it('answers the other one when the thinnest reserve is the one being kept up', () => {
    const prescription = prescribe(bothNeglected(), LATE, [], {
      mental: 43,
      physical: 70,
      social: 70,
      errands: 81,
    })

    expect(prescription?.type).toBe('mental')
  })

  /**
   * Errands has no advice of its own, deliberately -- telling somebody who is flat to do a
   * chore is advice nobody follows. The thinnest reserve having nothing to say must not
   * silence the advice for whatever else is overdue, which is the same defect the `find`
   * above this was written to stop.
   */
  it('still says something when the thinnest reserve has no advice to give', () => {
    const prescription = prescribe(bothNeglected(), LATE, [], {
      mental: 70,
      physical: 70,
      social: 70,
      errands: 12,
    })

    expect(prescription).not.toBeNull()
  })

  /** A reserve cannot conjure a prescription for a rhythm that is being kept. */
  it('prescribes nothing for a thin reserve whose rhythm is up to date', () => {
    expect(
      prescribe(keepingUp(), LATE, [], { mental: 70, physical: 70, social: 8, errands: 70 }),
    ).toBeNull()
  })

  /** The bot calls this without reserves and its two call sites must agree with each other,
   *  so the old ordering has to survive exactly as it was. */
  it('falls back to the most overdue when no reserves are given', () => {
    expect(prescribe(onlyNeglecting('socialRestorative'), LATE, [])?.type).toBe('social')
  })
})
