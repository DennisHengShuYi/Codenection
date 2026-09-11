import type { BlockAnswer, BlockRecord } from '../domain/blockLog'
import type { CalibrationProfile } from '../domain/calibration'
import { DEFAULT_PROFILE } from '../domain/calibration'
import type { EnergyPrediction } from '../domain/predictions'
import { HORIZON_DAYS, type ActivityKind, type LoadType } from '../engine'
import { makeRng, type Schedule, type ScheduledItem } from '../optimizer'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * How much of the fortnight is already behind the student.
 *
 * A week, because that is the smallest history that makes the app's own claims testable.
 * `roomModel` reads `projection.central[today - 1]` for every "where am I now" reading, so
 * with nothing behind today it falls back to `schedule.start` and the dial, the five bars
 * and the room's character all freeze on a constant no edit can move. `trendOf` wants three
 * days for an arrow and `energyHistory` wants three points for a line; seven clears both
 * with room to delete a day and still see something.
 */
export const DAYS_BEHIND = 7

const dayAfter = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * MS_PER_DAY).toISOString().split('T')[0] ?? iso

/** Local evening of the day being answered, which is when a student actually reports. */
const answeredAt = (anchoredOn: string, dayIndex: number): number =>
  Date.parse(`${anchoredOn}T12:00:00Z`) + dayIndex * MS_PER_DAY

/**
 * One week of a student's shape, repeated across the fortnight.
 *
 * Written as a weekly pattern rather than 21 hand-listed days for the reason `umWeek`
 * builds its classes the same way: a fortnight typed out longhand drifts, and a day quietly
 * missing its entry is exactly the silence §6.5 punishes.
 *
 * `kind` is the engine's own vocabulary (§6.6's carryover table), not the student's: a
 * lecture, a lab and a tutorial are all `studyBlock` to the model, and the title is what
 * carries the difference to the screen. Naming one `lecture` here typechecks nowhere and
 * throws inside `carryoverAt` the moment anything projects it.
 */
const WEEKLY: ReadonlyArray<{
  readonly weekday: number
  readonly title: string
  readonly type: LoadType
  readonly kind: ActivityKind
  readonly startHour: number
  readonly hours: number
  readonly fixed: boolean
}> = [
  { weekday: 0, title: 'Lecture', type: 'mental', kind: 'studyBlock', startHour: 9, hours: 2, fixed: true },
  { weekday: 0, title: 'Gym', type: 'physical', kind: 'hardExercise', startHour: 18, hours: 1, fixed: false },
  { weekday: 1, title: 'Lab session', type: 'mental', kind: 'studyBlock', startHour: 10, hours: 3, fixed: true },
  { weekday: 1, title: 'Groceries', type: 'errands', kind: 'errands', startHour: 17, hours: 1, fixed: false },
  { weekday: 2, title: 'Tutorial', type: 'mental', kind: 'studyBlock', startHour: 11, hours: 2, fixed: true },
  { weekday: 2, title: 'Group project meeting', type: 'social', kind: 'socialDraining', startHour: 19, hours: 2, fixed: false },
  { weekday: 3, title: 'Assignment work', type: 'mental', kind: 'studyBlock', startHour: 14, hours: 4, fixed: false },
  { weekday: 3, title: 'Laundry', type: 'errands', kind: 'errands', startHour: 18, hours: 1, fixed: false },
  { weekday: 4, title: 'Lecture', type: 'mental', kind: 'studyBlock', startHour: 9, hours: 2, fixed: true },
  { weekday: 4, title: 'Badminton', type: 'physical', kind: 'lightExercise', startHour: 17, hours: 1.5, fixed: false },
  { weekday: 5, title: 'Reading', type: 'mental', kind: 'studyBlock', startHour: 10, hours: 3, fixed: false },
  { weekday: 5, title: 'Family call', type: 'social', kind: 'socialRestorative', startHour: 20, hours: 1, fixed: false },
  { weekday: 6, title: 'Catch-up study', type: 'mental', kind: 'studyBlock', startHour: 13, hours: 4, fixed: false },
  { weekday: 6, title: 'Errand run', type: 'errands', kind: 'errands', startHour: 16, hours: 1, fixed: false },
]

/**
 * What a student said about each day already behind them.
 *
 * Under-estimating on study for `umBlockLog`'s stated reason -- students overrun writing
 * more than anything else, and a history where everything took exactly as long as planned
 * makes §2.4's padding look like it does nothing.
 */
const answerFor = (type: LoadType): BlockAnswer => (type === 'mental' ? 'longer' : 'right')

/**
 * Short on weeknights, caught up at the weekend -- the shape a student actually sleeps.
 *
 * Not a flat seven, and the difference is the whole fortnight. §6.1 pays recovery as
 * `max(0, sleep - 5) x k_sleep`, so seven hours returns twelve points of mental reserve a
 * night and simply outruns anything this timetable spends: at a flat seven the account
 * projects to 98% mental on a week that is visibly heavy, which would seed an app with
 * nothing to show. Six returns half that, and the fortnight starts behaving like the thing
 * the app is about.
 */
const SLEEP_BY_WEEKDAY: readonly number[] = [6, 6, 6, 5.5, 6, 8, 8]

/** Reported energy for the days behind today. Predicted close but never exact, so §8's
 *  accuracy line reads as measured rather than as a placeholder. */
const REPORTED: readonly number[] = [70, 65, 55, 50, 45, 50, 45]

export interface DemoAccount {
  readonly week: Schedule
  readonly blockLog: readonly BlockRecord[]
  readonly profile: CalibrationProfile
}

/**
 * A signed-in account with a week already behind it, for testing and demonstrating the app
 * against something other than day zero.
 *
 * Deliberately separate from `umCrunchWeek`, which `useSchedule` hands a session-less
 * visitor: that one is unanchored on purpose, so a preview always opens on its first day.
 * This one anchors itself behind today, which is the only way the dial, the five bars, the
 * trend arrows and the sparkline have anything to report -- and the only way an edit to a
 * past day can be seen to move them.
 *
 * Nothing here is protected rest (§5.1) and nothing here is a real student's data.
 *
 * @param todayIso the student's own day, YYYY-MM-DD. Passed in rather than read from a
 * clock, because §9 puts this app at UTC+8 where a UTC-derived "today" is wrong for the
 * first eight hours of every day -- and because a fixture that read a clock could not be
 * tested.
 */
export function demoAccount(todayIso: string, daysBehind: number = DAYS_BEHIND): DemoAccount {
  const anchoredOn = dayAfter(todayIso, -daysBehind)

  const items: ScheduledItem[] = []
  for (let dayIndex = 0; dayIndex < HORIZON_DAYS; dayIndex += 1) {
    for (const slot of WEEKLY.filter((entry) => entry.weekday === dayIndex % 7)) {
      items.push({
        id: `${slot.title.toLowerCase().replace(/\s+/g, '-')}-${dayIndex}`,
        title: slot.title,
        type: slot.type,
        kind: slot.kind,
        hours: slot.hours,
        intensity: 1,
        dayIndex,
        startHour: slot.startHour,
        fixed: slot.fixed,
        deadlineDay: null,
        // §5.1: a fixture may not mint protected rest. `domain/scheduleRecovery` is the
        // only door, and a seed writing one would be a second.
        protectedRest: false,
      })
    }
  }

  const blockLog: BlockRecord[] = items
    .filter((item) => item.dayIndex < daysBehind)
    .map((item) => ({
      blockId: item.id,
      type: item.type,
      plannedHours: item.hours,
      dayIndex: item.dayIndex,
      answer: answerFor(item.type),
      answeredAt: answeredAt(anchoredOn, item.dayIndex),
    }))

  const predictions: EnergyPrediction[] = Array.from({ length: daysBehind }, (_, offset) => ({
    forDate: dayAfter(anchoredOn, offset),
    predicted: (REPORTED[offset] ?? 50) + 8,
    reported: REPORTED[offset] ?? 50,
  }))

  return {
    week: {
      items,
      // Mid-semester rather than rested, for `umWeek`'s own reason -- "nobody opens a
      // workload app during a good week" -- but the depletion the dial shows today is still
      // earned by the week behind it rather than assumed into this figure.
      start: { mental: 68, physical: 72, social: 50, errands: 75 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, (_, day) => SLEEP_BY_WEEKDAY[day % 7] ?? 7),
      startedOn: anchoredOn,
    },
    blockLog,
    profile: { ...DEFAULT_PROFILE, predictions },
  }
}

/** The earliest and latest a scattered block may start, so nothing lands at four in the
 *  morning or runs past the end of the day `gaps.DAY_END_HOUR` recognises. */
const WAKE_HOUR = 8
const DAY_END_HOUR = 22

/**
 * The same fortnight, thrown around, for watching Rebalance and the forecast work.
 *
 * `demoAccount` is a tidy repeating week. That is the right baseline and a poor
 * demonstration: with the load already even there is little for the rebalancer to find, and
 * the projection slopes gently rather than showing the spiral the app exists to make visible.
 * This piles some days up and empties others, which is what a real fortnight looks like once
 * a student has been accepting things for a week.
 *
 * **Days already lived are never touched.** That is the same invariant the optimizer now
 * holds: the past happened, and a seed that rewrote it would be changing the reserve every
 * screen reads today. Fixed blocks stay too -- a timetable is a frame, not a suggestion.
 *
 * Seeded through the optimizer's own `Rng`, so a demo can be reproduced. A placement that
 * would sit on top of a fixed block is retried rather than accepted: an overlap with
 * something immovable is a constraint violation, and the point here is a hard week, not an
 * illegal one.
 */
export function scatter(week: Schedule, seed: number, today: number): Schedule {
  const rng = makeRng(seed)
  const fixed = week.items.filter((item) => item.fixed && item.dayIndex >= today)

  const clashesWithFixed = (dayIndex: number, startHour: number, hours: number): boolean =>
    fixed.some(
      (block) =>
        block.dayIndex === dayIndex &&
        startHour < block.startHour + block.hours &&
        block.startHour < startHour + hours,
    )

  return {
    ...week,
    items: week.items.map((item) => {
      if (item.dayIndex < today || item.fixed || item.protectedRest) return item

      // A handful of attempts, then leave it where it is. Searching properly is the
      // optimizer's job, and this only has to produce a mess worth solving.
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const dayIndex = today + Math.floor(rng() * (HORIZON_DAYS - today))
        const latest = DAY_END_HOUR - item.hours
        const startHour = WAKE_HOUR + Math.floor(rng() * Math.max(1, latest - WAKE_HOUR + 1))

        if (startHour > latest) continue
        if (clashesWithFixed(dayIndex, startHour, item.hours)) continue

        return { ...item, dayIndex, startHour }
      }

      return item
    }),
  }
}
