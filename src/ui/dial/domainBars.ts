import { LOAD_TYPE_LABELS } from '../kit/labels'
import {
  LOAD_TYPES,
  type DayInput,
  type LoadType,
  type Projection,
  type Reserves,
} from '../../engine'
import { trendOf, type Trend } from './trend'

export type { Trend } from './trend'

export type BarStatus = 'healthy' | 'stretched' | 'critical'

export type BarSpan = 'now' | 'horizon'

export interface DomainBar {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly ceiling: number
  readonly status: BarStatus
  /**
   * The stretch of time this bar's value covers.
   *
   * `now` is a reading taken at one instant -- the reserve entering today. `horizon` is a
   * figure over the whole projection. Both sit in one list, so without this a student reads
   * a snapshot and a fortnight as though they were the same kind of number.
   */
  readonly span: BarSpan
  /** Null where nothing measures a direction. The four reserve bars read theirs off the
   *  projection; the density bar has no such reading, and §1.5 makes an unmeasured claim a
   *  lie told to a screen reader rather than a harmless default. */
  readonly trend: Trend | null
  /** Plain-language reason this bar is not healthy, or null. Paired with the status so
   *  severity is never carried by colour alone (§1.5). */
  readonly warning: string | null
}

const CEILING = 100
const CRITICAL_BELOW = 20
const STRETCHED_BELOW = 40

/** §1.2: below this, social reads as a warning rather than as a quiet week. */
const SOCIAL_FLOOR_PERCENT = 40

const DENSITY_CRITICAL_ABOVE = 80
const DENSITY_STRETCHED_ABOVE = 60

/** Hours in a day beyond which a schedule is effectively full. Not 24: sleep, eating and
 *  getting between places are not free time. */
const FULL_DAY_HOURS = 12

/** The shared four words. This held a byte-identical second copy of them, which is exactly
 *  what `kit/labels.ts`'s own docstring forbids: "two copies of one vocabulary is how the
 *  planner and the week come to call the same thing different things". */
const LABELS = LOAD_TYPE_LABELS

/**
 * §0: schedule density is a derived view, not a fifth reserve.
 *
 * Committed hours as a percentage of what a fortnight can hold. Derived here in the UI
 * rather than in the engine, so the model keeps exactly four load types however many
 * labels the interface grows.
 */
export function scheduleDensity(days: readonly DayInput[]): number {
  if (days.length === 0) return 0

  const committed = days.reduce(
    (sum, day) =>
      sum +
      day.activities
        .filter((activity) => activity.kind !== 'sleep')
        .reduce((dayTotal, activity) => dayTotal + activity.hours, 0),
    0,
  )

  return Math.min(CEILING, (committed / (days.length * FULL_DAY_HOURS)) * CEILING)
}

function statusOf(value: number): BarStatus {
  if (value < CRITICAL_BELOW) return 'critical'
  if (value < STRETCHED_BELOW) return 'stretched'
  return 'healthy'
}

function warningFor(type: LoadType, value: number, status: BarStatus): string | null {
  // §1.2: low social is flagged as a warning, not as "good". Most trackers would count a
  // quiet social life as healthy; saying so out loud is what proves the model
  // understands burnout rather than adding up hours.
  if (type === 'social' && value < SOCIAL_FLOOR_PERCENT) {
    return 'You have been spending a lot of time alone.'
  }

  if (status === 'critical') return `${LABELS[type]} is nearly empty.`
  if (status === 'stretched') return `${LABELS[type]} is running low.`
  return null
}

export function domainBars(
  reserves: Reserves,
  projection: Projection,
  days: readonly DayInput[],
  /**
   * Which day the arrows are about.
   *
   * The whole projection used to go to `trendOf`, which keeps the last three entries -- so the
   * arrow described days 18, 19 and 20 of the fortnight while `trendOf` documented itself as
   * showing "where things are going now". On a projection that mostly decays that read falling
   * almost regardless of this week. Slicing to today and the two days before it is what makes
   * the glyph mean what it has always claimed to.
   *
   * The Today panel's own trend, added alongside this, reads three days too -- so the two
   * readings a student can reach describe the same span rather than opposite ends of it.
   */
  today: number,
): DomainBar[] {
  const reserveBars: DomainBar[] = LOAD_TYPES.map((type) => {
    const value = reserves[type]
    const status = statusOf(value)

    return {
      key: type,
      label: LABELS[type],
      value,
      ceiling: CEILING,
      status,
      // The reserve as it stands, not a period: `RoomShell` hands these in from the
      // projection's entering-today reading.
      span: 'now' as const,
      trend: trendOf(
        projection.central.slice(Math.max(0, today - 2), today + 1).map((day) => day[type]),
      ),
      warning: warningFor(type, value, status),
    }
  })

  const density = scheduleDensity(days)

  return [
    ...reserveBars,
    {
      key: 'schedule',
      label: 'How packed the days are',
      value: density,
      ceiling: CEILING,
      // The one bar where *more* is worse, so its thresholds run the other way. Reading
      // it on the same scale as the reserves would show a packed week as healthy.
      status:
        density > DENSITY_CRITICAL_ABOVE
          ? 'critical'
          : density > DENSITY_STRETCHED_ABOVE
            ? 'stretched'
            : 'healthy',
      // Committed hours across every day handed in, not today's -- which is why it needs
      // saying out loud beside four bars that are a single instant.
      span: 'horizon' as const,
      // Nothing projects how packed a future day will be, so there is no direction to
      // report. It read 'flat' before, which drew a "steady" glyph and announced "steady".
      trend: null,
      warning:
        density > DENSITY_CRITICAL_ABOVE ? 'Your days are almost completely booked.' : null,
    },
  ]
}
