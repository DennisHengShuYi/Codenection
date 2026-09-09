import { useEffect, useMemo, useState } from 'react'
import type { Repository, Session } from '../../data'
import { addItems } from '../../domain/addItems'
import { anchorTo, dateFor, isAnchored, todayIndex } from '../../domain/calendar'
import { accept } from '../../domain/commitments'
import { paramsFor } from '../../domain/engineParams'
import { firstAction } from '../../domain/microStart'
import { predictionsAfter, resolvePrediction } from '../../domain/predictions'
import { prescribe } from '../../domain/prescribe'
import { recordAttempt, attemptsIn } from '../../domain/recoveryLog'
import { completeItem, deferItem } from '../../domain/scheduleEdits'
import { scheduleRecovery } from '../../domain/scheduleRecovery'
import { describeRebalance, makeRng, rebalance } from '../../optimizer'
import { AccountBar } from '../auth/AccountBar'
import { CapacityDial } from '../dial/CapacityDial'
import { domainBars } from '../dial/domainBars'
import { overallReserve, project } from '../../engine'
import { toDayInputs } from '../../optimizer'
import { PreviewBanner } from '../auth/PreviewBanner'
import { BlockConfirm } from '../calibration/BlockConfirm'
import { CalibrationScreen } from '../calibration/CalibrationScreen'
import { useCalibration } from '../calibration/useCalibration'
import { MicroStartCard } from '../microStart/MicroStartCard'
import { PhotoImportScreen } from '../planner/PhotoImportScreen'
import { PlannerScreen } from '../planner/PlannerScreen'
import { Prescription } from '../recovery/Prescription'
import { LapsedNotice } from '../request/LapsedNotice'
import { RequestBoxScreen } from '../request/RequestBoxScreen'
import { LowEnergyView } from '../LowEnergyView'
import { useLowEnergy } from '../useLowEnergy'
import { useReducedMotion } from '../useReducedMotion'
import { useSchedule } from '../useSchedule'
import { AccuracyNote } from '../validation/AccuracyNote'
import { EnergyCheckIn } from '../validation/EnergyCheckIn'
import { DoorPanel } from '../recovery/DoorPanel'
import { LinkTelegram } from '../settings/LinkTelegram'
import { isClutterId, type ObjectId } from './objects'
import { Room } from './Room'
import { roomModel } from './roomModel'
import { RoomSidebar } from './RoomSidebar'
import { back, ROOM, toWords, zoomTo, type View } from './view'
import { ZoomLayer } from './ZoomLayer'
import { useTidyUp } from './useTidyUp'

/** §2.1's search takes its randomness as a parameter; a fixed seed keeps what the student
 *  sees reproducible between renders rather than shifting under them. */
const SEED = 20260908

/**
 * The room, as the whole app.
 *
 * This replaces `HomeScreen`, which was a switchboard: seven booleans, four early returns
 * that swapped the room out entirely, and nine cards stacked in a scroll above and below it.
 * §1.1 said the room was the surface; it was a section of a page.
 *
 * Here every feature is reached by touching furniture, every notification is a state of the
 * object it concerns, and the sidebar is the same thing in words.
 */
export function RoomShell({
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
  const { profile, setProfile } = useCalibration(repository)
  const [view, setView] = useState<View>(ROOM)
  const [report, setReport] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  /** Which way in the desk is currently offering. §1.4 ranks the camera above typing, so it
   *  is named first -- but neither is chosen for the student. */
  const [deskWay, setDeskWay] = useState<'choose' | 'type' | 'photograph'>('choose')

  const reducedMotion = useReducedMotion()
  const { play } = useTidyUp(reducedMotion)

  const params = useMemo(() => paramsFor(profile), [profile])
  const floor = schedule
    ? Math.min(schedule.start.mental, schedule.start.physical, schedule.start.social, schedule.start.errands)
    : 100
  const { active: lowEnergy, setOverride } = useLowEnergy(repository, floor)

  /**
   * §8.1's two prerequisites: anchor the fortnight to a real day, and claim something about a
   * real day two days out. The clock enters here and nowhere deeper -- `calendar.ts` takes it
   * as a parameter and the engine never sees it, which is what keeps the model pure.
   */
  useEffect(() => {
    if (!schedule) return

    if (!isAnchored(schedule)) {
      setSchedule(anchorTo(schedule, new Date()))
      return
    }

    const next = predictionsAfter(profile.predictions, schedule, paramsFor(profile), new Date())
    if (next.length !== profile.predictions.length) setProfile({ ...profile, predictions: next })
  }, [schedule, profile, setSchedule, setProfile])

  if (!schedule) {
    // A sentence rather than a spinner: a spinner tells a student nothing about what is
    // happening.
    return (
      <main className="mx-auto max-w-screen-md p-4">
        <p>Working out where you are…</p>
      </main>
    )
  }

  // Bound once, after the guard: narrowing does not survive into the closures below, and
  // threading `schedule!` through every one of them would be noise.
  const week = schedule
  const today = todayIndex(week, new Date()) ?? 0
  const model = roomModel({ schedule: week, profile, today })

  async function onRebalance() {
    if (working) return

    setWorking(true)
    // Setting state does not paint on its own and the solver holds the main thread, so
    // without handing control back first React never renders the working state.
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const result = rebalance(week, params, makeRng(SEED))
      setSchedule(result.schedule)
      setReport(describeRebalance(result, params))
      play()
    } finally {
      setWorking(false)
    }
  }

  const close = () => {
    setDeskWay('choose')
    setView(back(view))
  }

  /** What each object shows once you have walked up to it. */
  function contentFor(objectId: ObjectId) {
    if (isClutterId(objectId)) {
      const id = objectId.replace('clutter-', '')
      const item = week.items.find((candidate) => candidate.id === id)

      return (
        <>
          <MicroStartCard
            microStart={item ? firstAction(item) : null}
            onStarted={close}
            onDismiss={close}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSchedule(completeItem(week, id))
                close()
              }}
              className="rounded-lg bg-slate-900 px-3 py-2 text-white"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => {
                setSchedule(deferItem(week, id))
                close()
              }}
              className="rounded-lg border border-slate-400 px-3 py-2"
            >
              Later
            </button>
          </div>
        </>
      )
    }

    switch (objectId) {
      case 'desk': {
        // Two forms stacked on one surface gave two Cancel buttons and no way to tell which
        // was which. The desk offers the choice instead -- one job, two ways to do it.
        const accepted = (items: Parameters<typeof addItems>[1]) => {
          setSchedule(addItems(week, items))
          close()
        }

        if (deskWay === 'type') {
          return <PlannerScreen onAccept={accepted} onCancel={() => setDeskWay('choose')} />
        }

        if (deskWay === 'photograph') {
          return <PhotoImportScreen onAccept={accepted} onCancel={() => setDeskWay('choose')} />
        }

        return (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">What are you carrying?</h2>
            <p className="text-sm opacity-70">Photograph it, or type it out. Either works.</p>
            <div className="flex flex-wrap gap-2">
              {/* §1.4 ranks the camera above typing, because deadlines cause the pile-up and
                  a brief is where the deadlines are. */}
              <button
                type="button"
                data-testid="desk-photograph"
                onClick={() => setDeskWay('photograph')}
                className="rounded-lg bg-slate-900 px-4 py-3 text-white"
              >
                Photograph a brief
              </button>
              <button
                type="button"
                data-testid="desk-type"
                onClick={() => setDeskWay('type')}
                className="rounded-lg border border-slate-400 px-4 py-3"
              >
                Type it out
              </button>
            </div>
          </div>
        )
      }
      case 'phone':
        return (
          <>
            <LapsedNotice
              commitments={model.rows.some((row) => row.id === 'phone' && row.attention)
                ? (week.commitments ?? [])
                : []}
              onDismiss={close}
            />
            <Prescription
              prescription={
                prescribe(week, attemptsIn(week))?.kind === 'socialRestorative'
                  ? prescribe(week, attemptsIn(week))
                  : null
              }
              onAccept={(taken) => {
                setSchedule(scheduleRecovery(week, taken))
                close()
              }}
              onDismiss={(taken) => {
                setSchedule(recordAttempt(week, taken.kind, false))
                close()
              }}
            />
            <RequestBoxScreen
              schedule={week}
              onAccept={(item) => {
                setSchedule(accept(week, item, today))
                close()
              }}
              onCancel={close}
            />
            {session !== null && <LinkTelegram />}
          </>
        )
      case 'mirror':
        return (
          <>
            {session !== null && <AccountBar session={session} onSignOut={onSignOut} />}
            <CalibrationScreen profile={profile} onChange={setProfile} onDone={close} />
          </>
        )
      case 'papers': {
        const block = week.items.find(
          (candidate) =>
            candidate.dayIndex === today && !profile.confirmedItemIds.includes(candidate.id),
        )

        return (
          <BlockConfirm
            block={block ?? null}
            onAnswer={(happened, difficulty) => {
              if (!block) return

              // "Partly" counts as half the planned time, "no" as none. Both feed §2.4 as
              // real data rather than being discarded -- §7.9 is explicit that a student who
              // did not do the thing is the one whose data is most needed.
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
              close()
            }}
            onDismiss={close}
          />
        )
      }
      case 'bed': {
        const suggestion = prescribe(week, attemptsIn(week))

        return (
          <Prescription
            prescription={suggestion}
            onAccept={(taken) => {
              setSchedule(scheduleRecovery(week, taken))
              close()
            }}
            onDismiss={(taken) => {
              setSchedule(recordAttempt(week, taken.kind, false))
              close()
            }}
          />
        )
      }
      case 'door':
        return (
          <>
          <Prescription
            prescription={
              prescribe(week, attemptsIn(week))?.kind === 'lightExercise'
                ? prescribe(week, attemptsIn(week))
                : null
            }
            onAccept={(taken) => {
              setSchedule(scheduleRecovery(week, taken))
              close()
            }}
            onDismiss={(taken) => {
              setSchedule(recordAttempt(week, taken.kind, false))
              close()
            }}
          />
          <DoorPanel
            gapHours={4}
            onChoose={(outing) => {
              setSchedule(
                scheduleRecovery(week, {
                  title: outing.title,
                  type: 'physical',
                  kind: 'lightExercise',
                  hours: outing.hours,
                  dayIndex: today,
                  startHour: 16,
                }),
              )
              close()
            }}
            onClose={close}
          />
          </>
        )
      case 'character': {
        const todayDate = dateFor(week, today)

        return (
          <EnergyCheckIn
            onReport={(energy) => {
              if (todayDate !== null) {
                setProfile({
                  ...profile,
                  predictions: resolvePrediction(profile.predictions, todayDate, energy),
                })
              }
              close()
            }}
            onDismiss={close}
          />
        )
      }
      case 'ceiling':
        return (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void onRebalance()}
              disabled={working}
              data-testid="rebalance"
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white disabled:opacity-60 sm:w-auto"
            >
              {working ? 'Working out a better week…' : 'Rebalance my fortnight'}
            </button>
            {report !== null && (
              <p data-testid="rebalance-report" role="status" className="text-sm">
                {report}
              </p>
            )}
          </div>
        )
      case 'window':
        return <AccuracyNote predictions={profile.predictions} />
      case 'light': {
        /**
         * §1.2's dial, on the object that already means the reserve.
         *
         * It has to live somewhere: it is in §11's must-build tier, and the first version of
         * this shell dropped it entirely -- the light reported a percentage and the five
         * domain bars vanished. Putting it behind the light is the mapping that already
         * existed in the room's own vocabulary.
         */
        const days = toDayInputs(week)

        return (
          <CapacityDial
            capacity={overallReserve(week.start)}
            bars={domainBars(week.start, project(week.start, days, params), days)}
            projection={project(week.start, days, params)}
          />
        )
      }
      default: {
        // The plant reports its reading and nothing more.
        const row = model.rows.find((candidate) => candidate.id === objectId)

        return <p className="text-sm">{row ? `${row.label}: ${row.reading}` : ''}</p>
      }
    }
  }

  /**
   * §1.5: a student at 12% reserve should not be handed a dashboard.
   *
   * The design said low-energy would become the sidebar trimmed to what matters. Building it
   * that way lost the shape §1.5 actually asks for -- one number and one action -- because a
   * list of things needing you is still a list. `LowEnergyView` already gets that right and
   * is already tested, so it stays, and the sidebar's trimmed mode serves the words view
   * instead. A deviation from the spec, and the spec was wrong.
   */
  if (lowEnergy && view.kind !== 'zoom') {
    return (
      <LowEnergyView
        capacity={overallReserve(week.start)}
        action="Take twenty minutes outside"
        onAction={() => void onRebalance()}
        onExit={() => setOverride('off')}
      />
    )
  }

  return (
    <main className="flex min-h-dvh flex-col gap-4 p-4 md:flex-row md:gap-6">
      {/* The rail from 768px up; below that the list is reached by the toggle and takes the
          screen, because a sidebar and a usable room cannot share 320px. */}
      <div className="hidden md:block md:w-64 md:shrink-0">
        <RoomSidebar model={model} onSelect={(id) => setView(zoomTo(view, id))} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Not chrome, structure. A page with no h1 has no name to a screen reader and no
            identity to anybody else, and dropping it was an oversight rather than a
            decision. Kept small so the room still leads. */}
        <h1 className="text-sm font-semibold tracking-wide opacity-60">Codenection</h1>

        {/* The one thing that is not furniture. A student who does not know their week is
            not being saved will lose it, and a warning about data loss must not require
            discovering an object first. */}
        {session === null && <PreviewBanner onSignIn={onSignIn} />}

        <Room model={model} onSelect={(id) => setView(zoomTo(view, id))} />

        <button
          type="button"
          data-testid="open-words"
          onClick={() => setView(toWords(view))}
          className="self-start text-sm underline md:hidden"
        >
          Everything in words
        </button>
      </div>

      {view.kind === 'words' && (
        <div className="fixed inset-0 z-10 overflow-y-auto bg-white p-4">
          <button type="button" onClick={close} data-testid="words-back" className="mb-2 text-sm underline">
            Back to the room
          </button>
          <RoomSidebar model={model} onSelect={(id) => setView(zoomTo(view, id))} />
        </div>
      )}

      {view.kind === 'zoom' && (
        <ZoomLayer objectId={view.objectId} onClose={close}>
          {contentFor(view.objectId)}
        </ZoomLayer>
      )}
    </main>
  )
}
