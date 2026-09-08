import { useMemo, useState } from 'react'
import { DEFAULT_PARAMS, floorReserve, overallReserve, project } from '../engine'
import { umCrunchWeek } from '../fixtures/umWeek'
import {
  describeRebalance,
  makeRng,
  rebalance,
  toDayInputs,
  type Schedule,
} from '../optimizer'

/**
 * A seeded fortnight, so the app has something to say before the user has entered
 * anything.
 *
 * §0's no-cold-start rule: every screen renders something useful with zero user data.
 * This is the demo account §11 asks for, standing in until the import paths of §1.4 and
 * the planner of §3 exist to replace it.
 */
const seeded = (): Schedule => umCrunchWeek()

/** §2.1's search takes its randomness as a parameter. A fixed seed keeps what the user
 *  sees reproducible between renders. */
const SEED = 20260908

export function App() {
  const [schedule, setSchedule] = useState<Schedule>(seeded)
  const [report, setReport] = useState<string | null>(null)

  // The whole model is arithmetic over a 21-day array, so recomputing it on render is
  // cheaper than caching it -- and §0's "one source of truth" instinct applies: the
  // projection is derived from the schedule, never stored alongside it.
  const projection = useMemo(
    () => project(schedule.start, toDayInputs(schedule), DEFAULT_PARAMS),
    [schedule],
  )

  const capacity = Math.round(overallReserve(schedule.start))
  const worstDay = Math.round(projection.worstFloor)
  const floorNow = Math.round(floorReserve(schedule.start))

  function onRebalance() {
    const result = rebalance(schedule, DEFAULT_PARAMS, makeRng(SEED))
    setSchedule(result.schedule)
    setReport(describeRebalance(result, DEFAULT_PARAMS))
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Codenection</h1>
        <p className="text-sm opacity-70">Stress &amp; workload manager</p>
      </header>

      <section aria-labelledby="capacity-heading" className="flex flex-col gap-2">
        <h2 id="capacity-heading" className="text-sm font-medium uppercase tracking-wide opacity-70">
          Capacity
        </h2>

        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="text-5xl font-semibold tabular-nums" data-testid="capacity-value">
            {capacity}%
          </p>
          <p className="text-sm">
            Worst day ahead:{' '}
            <span className="font-semibold tabular-nums" data-testid="worst-day-value">
              {worstDay}
            </span>
          </p>
        </div>

        {/*
          §1.5: a full text equivalent of every dial value, and a primary view rather than
          a fallback. Severity is never carried by colour alone, so the words have to
          carry the same information the number does.
        */}
        <p className="text-sm opacity-80" data-testid="reserve-text-equivalent">
          You are at {capacity}% capacity. Your lowest reserve right now is {floorNow} out of
          100, and over the next {projection.central.length} days it reaches {worstDay}.{' '}
          {projection.firstDeficitDay === null
            ? 'Nothing on the horizon takes you into deficit.'
            : `You cross into deficit on day ${projection.firstDeficitDay}.`}
        </p>
      </section>

      <section aria-labelledby="balance-heading" className="flex flex-col gap-3">
        <h2 id="balance-heading" className="text-sm font-medium uppercase tracking-wide opacity-70">
          Balance the load
        </h2>

        {/* §0: primary actions in the lower half of the viewport on mobile, and reachable
            with one hand. A full-width target at this size is the simplest way there. */}
        <button
          type="button"
          onClick={onRebalance}
          data-testid="rebalance"
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white sm:w-auto"
        >
          Rebalance my fortnight
        </button>

        {report !== null && (
          <p className="text-sm" data-testid="rebalance-report" role="status">
            {report}
          </p>
        )}
      </section>
    </main>
  )
}
