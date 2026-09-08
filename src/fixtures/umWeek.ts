import { HORIZON_DAYS, type Reserves } from '../engine'
import type { Schedule, ScheduledItem } from '../optimizer'

/**
 * A realistic UM final-year semester week, for §2.5's degrees-of-freedom measurement.
 *
 * Deliberately typical rather than loose. The question §2.5 asks is how much slack a
 * *normal* student actually has, and an artificially slack fixture would answer it
 * flatteringly -- which is the one outcome that makes running the measurement pointless.
 *
 * Day 0 is a Monday. The horizon is 21 days, so each weekly fixture repeats three times.
 */

/** Mid-semester, not fresh. A student who opens this app is rarely starting at 100, and
 *  social is already the weakest reserve -- which is the case the model is built for. */
const START: Reserves = { mental: 62, physical: 58, social: 45, errands: 70 }

const WEEKLY_CLASSES: ReadonlyArray<{
  weekday: number
  title: string
  startHour: number
  hours: number
}> = [
  { weekday: 0, title: 'WIA3001 lecture', startHour: 9, hours: 2 },
  { weekday: 0, title: 'WIA3002 lecture', startHour: 14, hours: 2 },
  { weekday: 1, title: 'WIA3003 lab', startHour: 10, hours: 3 },
  { weekday: 2, title: 'WIA3001 tutorial', startHour: 11, hours: 1 },
  { weekday: 3, title: 'WIA3004 lecture', startHour: 9, hours: 2 },
  { weekday: 3, title: 'WIA3002 lab', startHour: 14, hours: 3 },
  { weekday: 4, title: 'FYP supervisor meeting', startHour: 10, hours: 1 },
]

/** Part-time weekend work: common enough among UM students to belong in a typical case,
 *  and it removes exactly the days a rebalancer would otherwise reach for. */
const SHIFTS: ReadonlyArray<{ weekday: number; startHour: number; hours: number }> = [
  { weekday: 5, startHour: 12, hours: 6 },
  { weekday: 6, startHour: 12, hours: 6 },
]

/** Assessed work: movable, with real deadlines. This is the set the optimizer has to
 *  work with, and its size is what §2.5 is really measuring. */
const ASSESSED: ReadonlyArray<{
  title: string
  hours: number
  deadlineDay: number
  dayIndex: number
  startHour: number
}> = [
  // Two of these start the fortnight sitting on a weekend shift day, right at the
  // ten-hour cap. That is the realistic shape of a final-year week and it is the shape
  // the §2.5 measurement needs to see: work the student has left as late as the deadline
  // allows, on the days that are already fullest.
  { title: 'WIA3001 essay', hours: 4, deadlineDay: 6, dayIndex: 5, startHour: 19 },
  { title: 'WIA3003 lab report', hours: 3, deadlineDay: 9, dayIndex: 8, startHour: 14 },
  { title: 'FYP chapter 2', hours: 4, deadlineDay: 13, dayIndex: 12, startHour: 19 },
  { title: 'WIA3002 group slides', hours: 3, deadlineDay: 15, dayIndex: 14, startHour: 19 },
  { title: 'WIA3004 problem set', hours: 2, deadlineDay: 19, dayIndex: 18, startHour: 19 },
]

/**
 * Ordinary life. Without it the fixture describes a student with no social contact for
 * three straight weeks, which is not typical -- and it is not neutral either: isolation
 * drain (§1.2) would dominate every other term, so the measurement would only ever
 * discover that the student needs to see people, never whether their *work* can be
 * moved. That is the question §2.5 actually asks.
 */
const LIFE: ReadonlyArray<{
  title: string
  weekday: number
  startHour: number
  hours: number
  kind: 'lightExercise' | 'hardExercise' | 'socialRestorative'
  type: 'physical' | 'social'
}> = [
  { title: 'Gym', weekday: 1, startHour: 18, hours: 1, kind: 'hardExercise', type: 'physical' },
  { title: 'Gym', weekday: 4, startHour: 18, hours: 1, kind: 'hardExercise', type: 'physical' },
  { title: 'Dinner with housemates', weekday: 2, startHour: 19, hours: 2, kind: 'socialRestorative', type: 'social' },
  { title: 'Football', weekday: 6, startHour: 19, hours: 2, kind: 'socialRestorative', type: 'social' },
]

const ERRANDS: ReadonlyArray<{ title: string; dayIndex: number; startHour: number }> = [
  { title: 'Groceries', dayIndex: 4, startHour: 18 },
  { title: 'Laundry', dayIndex: 9, startHour: 19 },
  { title: 'Post office', dayIndex: 11, startHour: 17 },
  { title: 'Bank', dayIndex: 16, startHour: 17 },
]

function fixedItems(): ScheduledItem[] {
  const out: ScheduledItem[] = []

  for (let day = 0; day < HORIZON_DAYS; day += 1) {
    for (const slot of WEEKLY_CLASSES.filter((c) => c.weekday === day % 7)) {
      out.push({
        id: `${slot.title}-${day}`,
        title: slot.title,
        type: 'mental',
        kind: 'studyBlock',
        hours: slot.hours,
        intensity: 1,
        dayIndex: day,
        startHour: slot.startHour,
        fixed: true,
        deadlineDay: null,
        protectedRest: false,
      })
    }

    for (const shift of SHIFTS.filter((s) => s.weekday === day % 7)) {
      out.push({
        id: `shift-${day}`,
        title: 'Part-time shift',
        type: 'errands',
        kind: 'errands',
        hours: shift.hours,
        intensity: 1,
        dayIndex: day,
        startHour: shift.startHour,
        fixed: true,
        deadlineDay: null,
        protectedRest: false,
      })
    }
  }

  return out
}

function assessedItems(): ScheduledItem[] {
  return ASSESSED.map((work) => ({
    id: work.title,
    title: work.title,
    type: 'mental',
    kind: 'studyBlock',
    hours: work.hours,
    intensity: 1,
    dayIndex: work.dayIndex,
    startHour: work.startHour,
    fixed: false,
    deadlineDay: work.deadlineDay,
    protectedRest: false,
  }))
}

function errandItems(): ScheduledItem[] {
  return ERRANDS.map((errand) => ({
    id: errand.title,
    title: errand.title,
    type: 'errands',
    kind: 'errands',
    hours: 1,
    intensity: 1,
    dayIndex: errand.dayIndex,
    startHour: errand.startHour,
    fixed: false,
    deadlineDay: null,
    protectedRest: false,
  }))
}

/** Movable, not fixed. Gym and seeing people are exactly what a student drops first when
 *  a week gets heavy, so the optimizer has to be able to reason about them -- and §5.1's
 *  whole stance is that it must not be the thing doing the dropping. */
function lifeItems(): ScheduledItem[] {
  const out: ScheduledItem[] = []

  for (let day = 0; day < HORIZON_DAYS; day += 1) {
    for (const slot of LIFE.filter((entry) => entry.weekday === day % 7)) {
      out.push({
        id: `${slot.title}-${day}`,
        title: slot.title,
        type: slot.type,
        kind: slot.kind,
        hours: slot.hours,
        intensity: 1,
        dayIndex: day,
        startHour: slot.startHour,
        fixed: false,
        deadlineDay: null,
        protectedRest: false,
      })
    }
  }

  return out
}

export function umSemesterWeek(): Schedule {
  return {
    items: [...fixedItems(), ...assessedItems(), ...errandItems(), ...lifeItems()],
    start: START,
    horizonDays: HORIZON_DAYS,
    // Short on weeknights, catching up at the weekend. The pattern itself is part of the
    // problem the app is looking at.
    sleepByDay: Array.from({ length: HORIZON_DAYS }, (_, day) =>
      day % 7 === 5 || day % 7 === 6 ? 8 : 6.5,
    ),
  }
}

/** Where the ordinary fortnight is already depleted before anything is added. Nobody
 *  opens a workload app during a good week. */
const CRUNCH_START: Reserves = { mental: 41, physical: 44, social: 32, errands: 55 }

/** Three assessments landing in the same week, which is the pile-up §2.5 says the
 *  optimizer exists for. */
const CRUNCH_EXTRA: ReadonlyArray<{
  title: string
  hours: number
  deadlineDay: number
  dayIndex: number
  startHour: number
}> = [
  // Start hours are chosen to sit in the gaps around that weekday's fixed classes.
  // Day 7 and 14 are Mondays (lectures 9-11 and 14-16); day 10 is a Thursday (lecture
  // 9-11, lab 14-17). Colliding with a lecture would make the fixture itself illegal.
  { title: 'WIA3004 midterm revision', hours: 5, deadlineDay: 8, dayIndex: 7, startHour: 16 },
  { title: 'WIA3001 presentation', hours: 4, deadlineDay: 9, dayIndex: 9, startHour: 14 },
  { title: 'Internship application', hours: 3, deadlineDay: 11, dayIndex: 11, startHour: 13 },
]

/**
 * The same student, in the fortnight they would actually open this app.
 *
 * Measured alongside the ordinary week because a solver that helps a healthy student by
 * six points and a struggling one not at all would be a feature with no user. §2.5's
 * question is really "does the optimizer have room where it matters", and only this
 * scenario answers that half of it.
 */
export function umCrunchWeek(): Schedule {
  const base = umSemesterWeek()

  return {
    ...base,
    start: CRUNCH_START,
    items: [
      ...base.items,
      ...CRUNCH_EXTRA.map((work) => ({
        id: work.title,
        title: work.title,
        type: 'mental' as const,
        kind: 'studyBlock' as const,
        hours: work.hours,
        intensity: 1,
        dayIndex: work.dayIndex,
        startHour: work.startHour,
        fixed: false,
        deadlineDay: work.deadlineDay,
        protectedRest: false,
      })),
    ],
    // Sleeping badly, which is both a cause and a symptom.
    sleepByDay: Array.from({ length: HORIZON_DAYS }, (_, day) =>
      day % 7 === 5 || day % 7 === 6 ? 7 : 5.5,
    ),
  }
}
