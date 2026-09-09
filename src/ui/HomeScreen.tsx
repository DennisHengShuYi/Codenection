import { useMemo, useState } from 'react'
import type { Repository, Session } from '../data'
import { DEFAULT_PARAMS, floorReserve, overallReserve, project } from '../engine'
import { describeRebalance, makeRng, rebalance, toDayInputs } from '../optimizer'
import { addItems } from '../domain/addItems'
import { padEstimates, paddingTable } from '../domain/applyPadding'
import { accept, lapsed } from '../domain/commitments'
import { freeGapOn, prescribe } from '../domain/prescribe'
import { attemptsIn, recordAttempt } from '../domain/recoveryLog'
import { firstAction, type MicroStart } from '../domain/microStart'
import { scheduleRecovery } from '../domain/scheduleRecovery'
import { MicroStartCard } from './microStart/MicroStartCard'
import { AccuracyNote } from './validation/AccuracyNote'
import { BlockConfirm } from './calibration/BlockConfirm'
import { CalibrationScreen } from './calibration/CalibrationScreen'
import { useCalibration } from './calibration/useCalibration'
import { completeItem, deferItem } from '../domain/scheduleEdits'
import { PhotoImportScreen } from './planner/PhotoImportScreen'
import { PlannerScreen } from './planner/PlannerScreen'
import { Prescription } from './recovery/Prescription'
import { LapsedNotice } from './request/LapsedNotice'
import { RequestBoxScreen } from './request/RequestBoxScreen'
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
  session = null,
  onSignOut = () => undefined,
  onSignIn = () => undefined,
}: {
  repository: Repository
  session?: Session | null
  onSignOut?: () => void
  onSignIn?: () => void
}) {
  const { schedule, setSchedule } = useSchedule(repository)
  const [report, setReport] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [planning, setPlanning] = useState(false)
  const [photographing, setPhotographing] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [calibrating, setCalibrating] = useState(false)
  const [confirmDismissed, setConfirmDismissed] = useState(false)
  const [microStart, setMicroStart] = useState<MicroStart | null>(null)
  const [dismissedLapses, setDismissedLapses] = useState(false)

  const reducedMotion = useReducedMotion()
  const { play } = useTidyUp(reducedMotion)

  const days = useMemo(() => (schedule ? toDayInputs(schedule) : []), [schedule])
  const projection = useMemo(
    () => (schedule ? project(schedule.start, days, DEFAULT_PARAMS) : null),
    [schedule, days],
  )

  const floor = schedule ? floorReserve(schedule.start) : 100
  const { active: lowEnergy, setOverride } = useLowEnergy(repository, floor)
  const { profile, setProfile } = useCalibration(repository)

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

  // Ahead of the low-energy branch: a student who opened the planner asked for it, and
  // replacing it with the reduced view would drop what they had already typed.
  if (planning) {
    return (
      <PlannerScreen
        onAccept={(items) => {
          // §2.4 applied silently: a student who consistently overruns gets a week built on
          // what their work actually costs, not on what they hoped. They are told the
          // conclusion on the how-you-work screen rather than asked to do the maths.
          setSchedule(addItems(schedule, padEstimates(items, paddingTable(profile.confirmations))))
          setPlanning(false)
        }}
        onCancel={() => setPlanning(false)}
      />
    )
  }

  // Same placement and same reason as the planner: someone who opened it asked for it, and
  // the low-energy view would discard the photo they had already chosen.
  if (photographing) {
    return (
      <PhotoImportScreen
        onAccept={(items) => {
          setSchedule(addItems(schedule, padEstimates(items, paddingTable(profile.confirmations))))
          setPhotographing(false)
        }}
        onCancel={() => setPhotographing(false)}
      />
    )
  }

  // §7.7: calibration is never a gate, so it is a screen you choose to open and can leave at
  // any point -- not something standing between the student and the room.
  if (calibrating) {
    return (
      <CalibrationScreen
        profile={profile}
        onChange={setProfile}
        onDone={() => setCalibrating(false)}
      />
    )
  }

  // Same again for the request box, and the same reason: the low-energy view would discard
  // the request they had already pasted.
  if (requesting) {
    return (
      <RequestBoxScreen
        schedule={schedule}
        onAccept={(item) => {
          // Today is 0 because the engine is pure and has no calendar; day 0 is "now"
          // everywhere else in the model. A real clock is its own change, not one to
          // smuggle in here.
          const [padded] = padEstimates([item], paddingTable(profile.confirmations))
          setSchedule(accept(schedule, padded ?? item, 0))
          setRequesting(false)
        }}
        onCancel={() => setRequesting(false)}
      />
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

      {session === null ? (
        <PreviewBanner onSignIn={onSignIn} />
      ) : (
        <AccountBar session={session} onSignOut={onSignOut} />
      )}

      {/* §2.3: a provisional yes that the reserve can no longer hold has already lapsed by
          the time this appears. Above the room, because it is the one thing on this screen
          that needs an answer rather than a glance. */}
      {!dismissedLapses && (
        <LapsedNotice
          commitments={lapsed(schedule, 0, DEFAULT_PARAMS)}
          onDismiss={() => setDismissedLapses(true)}
        />
      )}

      {/* §4.1: one concrete first action, from either trigger. */}
      <MicroStartCard
        microStart={microStart}
        onStarted={() => setMicroStart(null)}
        onDismiss={() => setMicroStart(null)}
      />

      {/* §7.9: the highest value-per-effort input in the app -- one prompt, two taps,
          feeding Reality Check, the carryover matrix and the Micro-Start trigger. */}
      {!confirmDismissed && (
        <BlockConfirm
          block={
            schedule.items.find(
              (item) => item.dayIndex === 0 && !profile.confirmedItemIds.includes(item.id),
            ) ?? null
          }
          onAnswer={(happened, difficulty) => {
            const block = schedule.items.find(
              (item) => item.dayIndex === 0 && !profile.confirmedItemIds.includes(item.id),
            )
            if (!block) return

            // "Partly" is counted as half the planned time actually happening, and "no" as
            // none of it. Both feed §2.4 as real data rather than being discarded -- §7.9 is
            // explicit that a student who did not do the thing is the one whose data is most
            // needed.
            const done = happened === 'yes' ? 1 : happened === 'partly' ? 0.5 : 0
            const overrun = difficulty === 'harder' ? 1.5 : difficulty === 'easier' ? 0.75 : 1

            setProfile({
              ...profile,
              confirmedItemIds: [...profile.confirmedItemIds, block.id],
              confirmations: [
                ...profile.confirmations,
                {
                  type: block.type,
                  plannedHours: block.hours,
                  actualHours: block.hours * done * overrun,
                },
              ],
            })
          }}
          onDismiss={() => setConfirmDismissed(true)}
        />
      )}

      {/* §5.2: one thing to do, beside the room rather than instead of it -- replacing the
          room with advice would take away the thing the student came to look at. */}
      <Prescription
        prescription={prescribe(schedule, attemptsIn(schedule))}
        onAccept={(suggestion) => setSchedule(scheduleRecovery(schedule, suggestion))}
        onDismiss={(suggestion) => setSchedule(recordAttempt(schedule, suggestion.kind, false))}
      />

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
          gapHours={freeGapOn(schedule, 0)}
          onCantStart={(id) => {
            const item = schedule.items.find((candidate) => candidate.id === id)
            if (item) setMicroStart(firstAction(item))
            setSelected(null)
          }}
          onChooseOuting={(outing) => {
            setSchedule(
              scheduleRecovery(schedule, {
                title: outing.title,
                type: 'physical',
                kind: 'lightExercise',
                hours: outing.hours,
                dayIndex: 0,
                startHour: 16,
              }),
            )
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

      {/* §8.1's scored number and §8.2's disclaimer, directly under the projection they
          are about -- §8.2 requires this in the product copy, not only in the pitch. */}
      <AccuracyNote predictions={profile.predictions} />

      {/* §0: primary actions in the lower half of the viewport on mobile, reachable
          one-handed. Full-width at phone size, shrinking to its content above it. */}
      <section className="flex flex-col gap-3">
        {/* §1.4 ranks the camera above typing, because deadlines cause the pile-up and a
            brief is where the deadlines are. So it sits alongside rather than buried. */}
        <button
          type="button"
          onClick={() => setPhotographing(true)}
          data-testid="open-photo"
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-base sm:w-auto"
        >
          Photograph a brief or a planner page
        </button>

        {/* §7.6: the payoff screen, and the way into calibration. Never a gate (§7.7). */}
        <button
          type="button"
          onClick={() => setCalibrating(true)}
          data-testid="open-calibration"
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-base sm:w-auto"
        >
          Tune it to you
        </button>

        {/* §2.3: for work someone else is trying to hand you. */}
        <button
          type="button"
          onClick={() => setRequesting(true)}
          data-testid="open-request"
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-base sm:w-auto"
        >
          Someone asked me for something
        </button>

        {/* §3.1: the third way in. Without these the rest of the app can only rearrange a
            week it invented for the student rather than one they actually have. */}
        <button
          type="button"
          onClick={() => setPlanning(true)}
          data-testid="open-planner"
          className="w-full rounded-lg border border-slate-400 px-4 py-3 text-base sm:w-auto"
        >
          Tell me what you are carrying
        </button>

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
