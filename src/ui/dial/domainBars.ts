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

export interface DomainBar {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly ceiling: number
  readonly status: BarStatus
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

const LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

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
      trend: trendOf(projection.central.map((day) => day[type])),
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
      // Nothing projects how packed a future day will be, so there is no direction to
      // report. It read 'flat' before, which drew a "steady" glyph and announced "steady".
      trend: null,
      warning:
        density > DENSITY_CRITICAL_ABOVE ? 'Your days are almost completely booked.' : null,
    },
  ]
}
