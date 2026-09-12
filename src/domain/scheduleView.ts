import { answeredIds, checkedInDays, outcomesFrom, type BlockRecord } from './blockLog'
import { dateFor } from './calendar'
import { paramsFor } from './engineParams'
import type { EnergyPrediction } from './predictions'
import type { SleepNight } from './sleepLog'
import { DEFICIT_THRESHOLD, floorReserve, HORIZON_DAYS, overallReserve, project } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'

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
  /**
   * Where the four reserves average out on this day, from the same projection the deficit
   * mark is read from.
   *
   * The mean, which is what the dial's headline quotes -- and worth knowing what that means
   * beside a warning: the mark is computed from the *floor*, so a day can read 67 and still
   * be marked. One reserve empty beside three healthy ones is exactly the case the floor
   * exists to catch and the mean exists to hide.
   */
  readonly reserve: number
  /** A block on a day already lived that has not been asked about. Drives §4's mark, so the
   *  confirmation prompt is discoverable from the overview and not only from the card. */
  readonly unconfirmed: boolean
  readonly isToday: boolean
}

export interface ScheduleViewInput {
  readonly schedule: Schedule
  /** Injected rather than read, so this stays pure. The shell supplies it. */
  readonly today: number
  /**
   * §8b's durable record of what was scheduled and what became of it. Threaded in rather
   * than loaded here, so this stays pure -- the shell reads it from the repository and
   * supplies it. Optional and defaulting to empty, mirroring `RoomModelInput`, so every
   * caller built before the log existed keeps compiling and behaving exactly as it did.
   */
  readonly blockLog?: readonly BlockRecord[]
  /** §8.1's resolved predictions, for the learned recovery coefficients. Optional and
   *  defaulting to empty, exactly as `blockLog` is. */
  readonly predictions?: readonly EnergyPrediction[]
  /** §8b's reported nights, for how much sleep is enough for this student. Optional and
   *  defaulting to empty, exactly as the two above are -- and threaded for the same reason
   *  they are: the week grid and the room must not run two different models. */
  readonly nights?: readonly SleepNight[]
}

const bandFor = (hours: number): LoadBand =>
  hours >= HEAVY_ABOVE_HOURS ? 'heavy' : hours >= BUSY_ABOVE_HOURS ? 'busy' : 'light'

export function scheduleView({
  schedule,
  today,
  blockLog = [],
  predictions = [],
  nights = [],
}: ScheduleViewInput): readonly DayCell[] {
  // Same reason `roomModel` takes these: the week grid and the room must not run two
  // different models over one fortnight.
  const params = paramsFor(outcomesFrom(blockLog), predictions, nights)
  // §6.5/§8b: the same signal `roomModel.ts` threads into its own projection, so the week
  // overview's deficit marks and the room's dial agree about what "silent" means instead
  // of reading one fortnight two different ways.
  const checkedIn = checkedInDays(blockLog, today, schedule.horizonDays)
  const projection = project(schedule.start, toDayInputs(schedule, checkedIn), params)

  const alreadyAsked = (id: string) => answeredIds(blockLog).includes(id)

  return Array.from({ length: HORIZON_DAYS }, (_, dayIndex): DayCell => {
    const onDay = schedule.items.filter((item) => item.dayIndex === dayIndex)
    const hours = onDay.reduce((total, item) => total + item.hours, 0)
    const reserves = projection.central[dayIndex]

    return {
      dayIndex,
      date: dateFor(schedule, dayIndex),
      band: bandFor(hours),
      hours,
      // On the floor, not the mean -- the same test `projection.firstDeficitDay` applies
      // (`engine/projection.ts`), so the grid's marks, the dial's crossing sentence, the
      // room's weather and the optimizer's objective all mean one thing by "deficit". This
      // read the mean, which is strictly laxer: a day the dial called a crossing could
      // render unmarked here, because mental at 5 beside errands at 90 averages fine.
      deficit: reserves !== undefined && floorReserve(reserves) < DEFICIT_THRESHOLD,
      reserve: reserves === undefined ? 0 : overallReserve(reserves),
      // A day still ahead cannot have been lived, so asking about it would be asking a
      // student to report the future.
      unconfirmed: dayIndex <= today && onDay.some((item) => !alreadyAsked(item.id)),
      isToday: dayIndex === today,
    }
  })
}
