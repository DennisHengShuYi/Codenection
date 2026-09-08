import { useMemo, useState } from 'react'
import type { Repository } from '../data'
import { DEFAULT_PARAMS, floorReserve, overallReserve, project } from '../engine'
import { describeRebalance, makeRng, rebalance, toDayInputs } from '../optimizer'
import { completeItem, deferItem } from '../domain/scheduleEdits'
import { AccountBar } from './auth/AccountBar'
import { PreviewBanner } from './auth/PreviewBanner'
import { CapacityDial } from './dial/CapacityDial'
import { domainBars } from './dial/domainBars'
import { LowEnergyView } from './LowEnergyView'
import { useLowEnergy } from './useLowEnergy'
import { ObjectDetail } from './room/ObjectDetail'
import { RoomComparison } from './room/RoomComparison'
import { roomStateFor } from './room/roomState'
import { useTidyUp } from './room/useTidyUp'
import { useReducedMotion } from './useReducedMotion'
import { useSchedule } from './useSchedule'

/** §2.1's search takes its randomness as a parameter; a fixed seed keeps what the
 *  student sees reproducible between renders rather than shifting under them. */
const SEED = 20260908

/** The auth props default so every existing HomeScreen test keeps working unchanged. If
 *  a later change makes them required, those tests must be updated in the same change
 *  rather than having the defaults quietly reintroduced. */
export function HomeScreen({
  repository,
  email = null,
  onSignOut = () => undefined,
  onSignIn = () => undefined,
}: {
  repository: Repository
  email?: string | null
  onSignOut?: () => void
  onSignIn?: () => void
}) {
  const { schedule, setSchedule } = useSchedule(repository)
  const [report, setReport] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const reducedMotion = useReducedMotion()
  const { play } = useTidyUp(reducedMotion)

  const days = useMemo(() => (schedule ? toDayInputs(schedule) : []), [schedule])
  const projection = useMemo(
    () => (schedule ? project(schedule.start, days, DEFAULT_PARAMS) : null),
    [schedule, days],
  )

  const floor = schedule ? floorReserve(schedule.start) : 100
  const { active: lowEnergy, setOverride } = useLowEnergy(repository, floor)

  /**
   * The solve takes over a second on a laptop and several on phone-class hardware --
   * §2.1's 100ms budget is not met yet, and closing that gap needs incremental scoring
   * rather than tuning. Until then this screen has to be honest about the wait instead of
   * looking broken.
   *
   * The yield is what makes that work rather than merely intended: setting state does not
   * paint on its own, and the solver holds the main thread for its whole run, so without
   * handing control back to the browser first React never renders the working state and
   * the student taps a button that appears dead.
   */
  async function onRebalance(current = schedule) {
    if (!current || working) return

    setWorking(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const result = rebalance(current, DEFAULT_PARAMS, makeRng(SEED))
      setSchedule(result.schedule)
      setReport(describeRebalance(result, DEFAULT_PARAMS))
      // §1.3's one tidy-up sequence: the visible payoff for a change just agreed to.
      play()
    } finally {
      // In a finally so a solver that throws leaves the button usable rather than
      // stranding the screen in a working state it can never leave.
      setWorking(false)
    }
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
  const room = roomStateFor(schedule.start, projection, schedule)

  if (lowEnergy) {
    return (
      <LowEnergyView
        capacity={capacity}
        action="Take twenty minutes outside"
        onAction={() => void onRebalance(schedule)}
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

      {email === null ? (
        <PreviewBanner onSignIn={onSignIn} />
      ) : (
        <AccountBar email={email} onSignOut={onSignOut} />
      )}

      {/* §1.1: the room is the surface; the dial sits in one corner as a compact
          readout. §10: at phone width it stacks above rather than sitting beside. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="sm:flex-1">
          <RoomComparison now={room} onSelect={setSelected} />
        </div>
        <div className="sm:w-40">
          <CapacityDial
            capacity={capacity}
            bars={domainBars(schedule.start, projection, days)}
            projection={projection}
            compact
          />
        </div>
      </div>

      {selected !== null && (
        <ObjectDetail
          objectId={selected}
          state={room}
          onComplete={(id) => {
            setSchedule(completeItem(schedule, id))
            setSelected(null)
          }}
          onDefer={(id) => {
            setSchedule(deferItem(schedule, id))
            setSelected(null)
          }}
          onClose={() => setSelected(null)}
        />
      )}

      {/* The full dial stays below the room, so the five domain bars and the spoken
          summary from the glance layer are not lost. */}
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
          onClick={() => void onRebalance(schedule)}
          disabled={working}
          data-testid="rebalance"
          className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 sm:w-auto"
        >
          {working ? 'Working out a better week…' : 'Rebalance my fortnight'}
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
