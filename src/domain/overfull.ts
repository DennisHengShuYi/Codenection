import { DEFICIT_THRESHOLD, floorReserve, project, type EngineParams } from '../engine'
import { makeRng, rebalance, toDayInputs, type Schedule, type ScheduledItem } from '../optimizer'
import { blocksOnDay } from './dayBlocks'

/**
 * A day the fortnight cannot hold, and what is standing on it.
 *
 * `candidates` is never empty. A card that names a problem and then hands the student an
 * empty list has made things worse, so a day with nothing droppable is not reported at all.
 */
export interface OverfullDay {
  readonly dayIndex: number
  readonly candidates: readonly ScheduledItem[]
}

/**
 * §2.2's other answer: the fortnight that is not badly arranged, just too big.
 *
 * Everything else this app offers a struggling student is a rearrangement -- move the lab
 * report, batch the errands, take a rest -- because for somebody merely badly scheduled that
 * is the right answer and a good one. This is the case where it is not. The work does not fit
 * in the days available, and no amount of moving it will make it fit; something has to come
 * out.
 *
 * So the rebalancer is run here purely in order to be disbelieved. If its own best attempt
 * clears the deficit, this says nothing: that student has a Rebalance button, and telling
 * them to delete work they could have kept would be the app giving up on their behalf.
 *
 * What it does NOT do is decide which of their commitments matters least. Nothing in a
 * `ScheduledItem` says how much something matters -- there is `fixed`, `deadlineDay`,
 * `hours`, `kind`, and no field anywhere for importance -- and inventing a ranking out of
 * those would be exactly the confidently wrong number this project holds to be worse than an
 * admitted gap. A student decides what to drop; this only says which day is the problem and
 * what is on it.
 *
 * Pure, like the rest of this folder: the clock enters as `today` and the randomness as
 * `seed`, neither is read here.
 */
export function overfullDay(
  schedule: Schedule,
  params: EngineParams,
  seed: number,
  today: number,
  /**
   * §8b's missing-data signal, exactly as the room's own projection has it.
   *
   * Required rather than defaulted, and this is the parameter the whole module hangs on. The
   * optimizer evaluates candidate weeks under `ALL_PRESENT`, which is a deliberate property
   * of the *search* -- a hypothetical week has no check-in history to be pessimistic about.
   * Reusing that here looked reasonable and was wrong: under it a heavy fortnight reads as
   * affordable, so this card would have stayed silent on exactly the weeks the dial beside it
   * was calling a deficit. The invariant is that "deficit" means the floor, everywhere, and a
   * card disagreeing with the gauge it sits under is the specific failure that rule exists to
   * stop. Callers pass what `checkedInDays` gave them.
   */
  checkedIn: readonly boolean[],
): OverfullDay | null {
  const failing = failingDays(schedule, params, checkedIn).filter((day) => day >= today)
  if (failing.length === 0) return null

  // Seeded for §2.1's reason: a student who looks twice must not be shown two answers.
  //
  // The rearranged week is measured against the same history as the real one -- moving a
  // block does not change which days the student answered on.
  const rearranged = rebalance(schedule, params, makeRng(seed), today)
  if (failingDays(rearranged.schedule, params, checkedIn).length === 0) return null

  // The first failing day the student can still act on AND that has something to act with.
  // Read off the week they actually have: the rearranged one above is a hypothesis this
  // function builds and discards, and naming its days would point at a week not on screen.
  for (const dayIndex of failing) {
    const candidates = blocksOnDay(schedule, dayIndex).filter((item) => !item.protectedRest)

    if (candidates.length > 0) return { dayIndex, candidates }
  }

  return null
}

/**
 * Every day whose floor is under water, in order.
 *
 * The floor rather than the mean, per the invariant that "deficit" means the floor
 * everywhere: the mean is strictly laxer, and a module using it would disagree with the dial
 * and the week grid about the same fortnight.
 *
 * `Projection.firstDeficitDay` is not enough on its own here. It answers "when does this
 * start", and this needs to walk past a first day that is already behind the student or that
 * holds nothing but protected rest. `project` rather than `summarise` for the same reason:
 * the summary carries the counts, and this needs the days themselves.
 */
function failingDays(
  schedule: Schedule,
  params: EngineParams,
  checkedIn: readonly boolean[],
): readonly number[] {
  const projection = project(schedule.start, toDayInputs(schedule, checkedIn), params)

  return projection.central.flatMap((reserves, day) =>
    floorReserve(reserves) < DEFICIT_THRESHOLD ? [day] : [],
  )
}
