import { useMemo, useState } from 'react'
import type { Repository } from '../data'
import { DEFAULT_PARAMS, floorReserve, overallReserve, project } from '../engine'
import { describeRebalance, makeRng, rebalance, toDayInputs } from '../optimizer'
import { CapacityDial } from './dial/CapacityDial'
import { domainBars } from './dial/domainBars'
import { LowEnergyView } from './LowEnergyView'
import { useLowEnergy } from './useLowEnergy'
import { useSchedule } from './useSchedule'

/** §2.1's search takes its randomness as a parameter; a fixed seed keeps what the
 *  student sees reproducible between renders rather than shifting under them. */
const SEED = 20260908

export function HomeScreen({ repository }: { repository: Repository }) {
  const { schedule, setSchedule } = useSchedule(repository)
  const [report, setReport] = useState<string | null>(null)

  const days = useMemo(() => (schedule ? toDayInputs(schedule) : []), [schedule])
  const projection = useMemo(
    () => (schedule ? project(schedule.start, days, DEFAULT_PARAMS) : null),
    [schedule, days],
  )

  const floor = schedule ? floorReserve(schedule.start) : 100
  const { active: lowEnergy, setOverride } = useLowEnergy(repository, floor)

  function onRebalance(current = schedule) {
    if (!current) return

    const result = rebalance(current, DEFAULT_PARAMS, makeRng(SEED))
    setSchedule(result.schedule)
    setReport(describeRebalance(result, DEFAULT_PARAMS))
  }

  if (!schedule || !projection) {
    // A single frame before storage answers. A sentence rather than a spinner, because a
    // spinner tells a student nothing about what is happening.
    return (
      <main className="mx-auto max-w-screen-md p-4">
        <p>Working out where you are…</p>
      </main>
    )
  }

  const capacity = overallReserve(schedule.start)

  if (lowEnergy) {
    return (
      <LowEnergyView
        capacity={capacity}
        action="Take twenty minutes outside"
        onAction={() => onRebalance(schedule)}
        onExit={() => setOverride('off')}
      />
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Codenection</h1>
        <p className="text-sm opacity-70">Everything you are carrying, in one screen.</p>
      </header>

      <CapacityDial
        capacity={capacity}
        bars={domainBars(schedule.start, projection, days)}
        projection={projection}
      />

      {/* §0: primary actions in the lower half of the viewport on mobile, reachable
          one-handed. Full-width at phone size, shrinking to its content above it. */}
      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => onRebalance(schedule)}
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
