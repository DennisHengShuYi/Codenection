import type { ParsedItem } from '../ai'
import {
  DEFICIT_THRESHOLD,
  FULL_RESERVE,
  overallReserve,
  project,
  type EngineParams,
  type LoadType,
  type Projection,
} from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { addItems } from './addItems'
import { checkedInDays, type BlockRecord } from './blockLog'

/**
 * Hours of restorative company that one "evening" stands for.
 *
 * The unit is a `socialRestorative` block because that is one of only three things
 * `recoveryForDay` actually credits -- sleep above baseline, rest blocks, and restorative
 * social contact. §2.3's own example says "two gym sessions", but exercise is *load* in this
 * model rather than recovery, so a price in gym sessions would be a number with nothing
 * behind it.
 */
const EVENING_HOURS = 2

export interface RequestCost {
  readonly firstDeficitDayBefore: number | null
  readonly firstDeficitDayAfter: number | null
  /**
   * The lowest the *affected* reserve gets across the fortnight, before and after.
   *
   * Deliberately not the projection's `worstFloor`, which is the minimum across all four
   * types at once. Measuring on that reported **zero cost for the commonest request there
   * is**: for a rested student the overall floor is social, set by isolation drain three
   * weeks out, and a mental request does not touch it. Twelve hours of study moved
   * `worstFloor` not at all.
   */
  readonly floorBefore: number
  readonly floorAfter: number
  /**
   * The largest single-day fall the request causes in the reserve it draws from. **This is
   * the price**, and the two floors above are context for it.
   *
   * The floor alone is not the price either: it sits at the fortnight's own trough, which
   * for a rested student is day zero — before the request even lands. So a one-hour ask and
   * a twelve-hour ask produced an identical floor, and the number a student was being asked
   * to decide on did not move with the size of what they were agreeing to.
   *
   * The deepest drop does move: 3.5, then 8.7, then 17.9 for one, twelve and twenty hours.
   * That is what "how much lower does this push me" actually means.
   */
  readonly deepestDrop: number
  /**
   * The headline reserve figure after taking it on — the same number the dial shows.
   *
   * §2.3's phrasing is "this pushes you to 105%", which is committed load against capacity.
   * This app has no such metric: the dial (§1.2) shows *reserve*. Inventing a second
   * percentage that moves the opposite way would put two conflicting numbers on one screen,
   * so the warning is stated in the app's own units -- "this takes you from 62 to 41" --
   * which is the same information in the language the student has already learned.
   */
  readonly capacityAfter: number
  /**
   * How many evenings of restorative company it would take to cover what this costs.
   *
   * An equivalence, NOT a list of blocks the optimizer removed -- it removes nothing, its
   * moves only shift, batch, insert and reorder. Wording that implies otherwise would be a
   * lie about the model, and one a student would eventually catch.
   */
  readonly eveningsEquivalent: number
  /** False when taking it on drops the floor into deficit. §2.3's "warn before accepting",
   *  expressed as something the model can actually answer. */
  readonly absorbable: boolean
}

/**
 * The first day the floor crosses into deficit, or null if it never does.
 *
 * The projection already counts deficit days but has never said when the first one arrives,
 * and the day is the half a student can act on -- §2.3 asks for "day 21 to day 14", not
 * "seven deficit days".
 */
/**
 * The lowest a single reserve type reaches anywhere on the horizon.
 *
 * This is what the price is measured on, for the reason spelled out on `floorBefore`: the
 * projection's own `worstFloor` takes the minimum across all four types at once, and for a
 * rested student that is social isolation three weeks out — which no amount of study work
 * moves.
 */
const lowestOf = (projection: Projection, type: LoadType): number =>
  projection.central.reduce((lowest, day) => Math.min(lowest, day[type]), FULL_RESERVE)

export function firstDeficitDay(projection: Projection): number | null {
  for (const [day, reserves] of projection.central.entries()) {
    const floor = Math.min(reserves.mental, reserves.physical, reserves.social, reserves.errands)
    if (floor < DEFICIT_THRESHOLD) return day
  }

  return null
}

/**
 * Prices a proposed commitment against the week as it stands.
 *
 * §2.3: never "this takes 6 hours", always what it costs you. The work is done by adding it
 * to a *copy* of the week and reading the difference out of the projection that already
 * exists -- the model already knows the answer, because it has just been asked to carry it.
 *
 * `today` and `blockLog` are REQUIRED, and that is Ruling 41's enabler rather than a style
 * preference. They used to default to `0` and `[]`, and the defaults are precisely what let
 * the Telegram `/ask` call site be silently wrong for as long as it existed: it priced every
 * request against day 0 of the fortnight with no check-in evidence, compiled, read
 * reasonably, and tested green. A caller that genuinely means "no evidence" says so, in
 * writing, at the call site -- which is a thing a reviewer can see.
 *
 * With them supplied, the price is judged against the fortnight the student is actually
 * living, including §6.5's missing-data pessimism, the same way `roomModel` and `lapsed` do.
 */
export function priceRequest(
  schedule: Schedule,
  item: ParsedItem,
  params: EngineParams,
  today: number,
  blockLog: readonly BlockRecord[],
): RequestCost {
  const checkedIn = checkedInDays(blockLog, today, schedule.horizonDays)
  const before = project(schedule.start, toDayInputs(schedule, checkedIn), params)

  // addItems returns a new week, so the caller's is never touched.
  const withRequest = addItems(schedule, [item])
  const after = project(
    withRequest.start,
    toDayInputs(withRequest, checkedInDays(blockLog, today, withRequest.horizonDays)),
    params,
  )

  const floorBefore = lowestOf(before, item.type)
  const floorAfter = lowestOf(after, item.type)

  const deepestDrop = before.central.reduce((deepest, day, index) => {
    const afterDay = after.central[index]
    return afterDay ? Math.max(deepest, day[item.type] - afterDay[item.type]) : deepest
  }, 0)

  const perEvening = params.kSocialContact * EVENING_HOURS

  return {
    // The crossing stays on the true floor across all four types, because that is what
    // "deficit" already means to the dial and the room. Only the *price* is per-type.
    firstDeficitDayBefore: firstDeficitDay(before),
    firstDeficitDayAfter: firstDeficitDay(after),
    floorBefore,
    floorAfter,
    deepestDrop: Math.round(deepestDrop * 10) / 10,
    // Already 0-100; FULL_RESERVE is 100, so scaling it again would be a no-op dressed up
    // as a conversion.
    capacityAfter: Math.round(overallReserve(withRequest.start)),
    eveningsEquivalent:
      perEvening > 0 ? Math.round((deepestDrop / perEvening) * 10) / 10 : 0,
    absorbable: floorAfter >= DEFICIT_THRESHOLD,
  }
}
