import { useEffect, useMemo, useState } from 'react'
import type { Repository, Session } from '../../data'
import { addItems } from '../../domain/addItems'
import { checkedInDays, outcomesFrom, type BlockAnswer, type BlockRecord } from '../../domain/blockLog'
import { anchorTo, dateFor, isAnchored, todayIndex } from '../../domain/calendar'
import { accept, lapsed } from '../../domain/commitments'
import { paramsFor } from '../../domain/engineParams'
import { firstAction, isStuck } from '../../domain/microStart'
import { predictionsAfter, resolvePrediction } from '../../domain/predictions'
import { prescribe } from '../../domain/prescribe'
import { completeItem, deferItem } from '../../domain/scheduleEdits'
import { scheduleRecovery } from '../../domain/scheduleRecovery'
import { overallReserve, project } from '../../engine'
import type { Fix } from '../../optimizer'
import { toDayInputs } from '../../optimizer'
import { AddSheet } from '../AddSheet'
import { AccountBar } from '../auth/AccountBar'
import { PreviewBanner } from '../auth/PreviewBanner'
import { CapacityDial } from '../dial/CapacityDial'
import { domainBars } from '../dial/domainBars'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'
import { LinkTelegram } from '../settings/LinkTelegram'
import { blockToAsk, withSleep } from '../today/checkIn'
import { useLowEnergy } from '../useLowEnergy'
import { useProfile } from '../useProfile'
import { useReducedMotion } from '../useReducedMotion'
import { useSchedule } from '../useSchedule'
import { AccuracyNote } from '../validation/AccuracyNote'
import { BlockSheet } from '../week/BlockSheet'
import { blockSheet } from '../week/blockActions'
import { runRebalance } from '../week/rebalanceOutcome'
import { WeekScreen } from '../week/WeekScreen'
import { visibleCards } from './cardPrecedence'
import { LiveCards } from './LiveCards'
import { roomModel } from './roomModel'
import { describeRoom } from './roomText'
import { Room } from './Room'
import { back, ROOM, toAdd, toBlock, toSettings, toWeek, type View } from './view'
import { useTidyUp } from './useTidyUp'

/** §2.1's search takes its randomness as a parameter; a fixed seed keeps what the student
 *  sees reproducible between renders rather than shifting under them. */
const SEED = 20260908

/** The one sentence the room can never say another way (§3): character state, capped from
 *  `describeRoom`'s own three-sentence paragraph rather than re-deriving it. */
const firstSentence = (paragraph: string): string => paragraph.match(/^[^.]*\./)?.[0] ?? paragraph

/**
 * The room, as the whole app -- and now the router.
 *
 * §3 turns the old 507-line switchboard into two things only: the data every screen needs
 * (the schedule, the profile, the block log, the anchoring and prediction effect, rebalance)
 * and routing between the room, the week, a block sheet, the add sheet and settings. The
 * eleven-case `contentFor` switch this replaced is gone entirely -- every feature it held
 * now belongs to the component that owns it (`WeekScreen`, `BlockSheet`, `TodayCard`,
 * `LiveCards`, `AddSheet`) rather than being inlined here.
 */
export function RoomShell({
  repository,
  session = null,
  onSignOut = () => undefined,
  onSignIn = () => undefined,
  // Ruling 12: required rather than defaulted to `[]`. `RoomShell` is being rewritten
  // wholesale in this task, which is exactly the point Task 8b's own note named as the
  // moment to stop treating the log as optional -- the caller now has somewhere to load a
  // real one from (`useBlockLog`) and a reason to (the today card and the block sheet both
  // write to it here for the first time).
  blockLog,
  onAnswerBlock,
}: {
  repository: Repository
  session?: Session | null
  onSignOut?: () => void
  onSignIn?: () => void
  blockLog: readonly BlockRecord[]
  onAnswerBlock: (record: BlockRecord) => void
}) {
  const { schedule, setSchedule } = useSchedule(repository)
  const { profile, setProfile } = useProfile(repository)
  const [view, setView] = useState<View>(ROOM)
  const [report, setReport] = useState<string | null>(null)
  const [fallback, setFallback] = useState<Fix | null>(null)
  const [working, setWorking] = useState(false)

  // Session-scoped dismissals for the four live cards, none of which has a domain-level
  // "not today" of its own any more. §7 retired the recovery card's permanent
  // failed-recovery log: "not today" is now exactly this kind of same-day dismissal rather
  // than a report that suppressed the advice forever.
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)
  const [lapsedDismissed, setLapsedDismissed] = useState(false)
  const [stuckDismissedId, setStuckDismissedId] = useState<string | null>(null)
  const [todayDismissed, setTodayDismissed] = useState(false)
  const [sleepAnsweredToday, setSleepAnsweredToday] = useState(false)

  const reducedMotion = useReducedMotion()
  const { play } = useTidyUp(reducedMotion)

  // §8b/Task 17: the durable log is the only source `paramsFor` reads now -- see
  // `roomModel.ts`'s matching call for why the profile's `confirmations` side is gone.
  const params = useMemo(() => paramsFor(outcomesFrom(blockLog)), [blockLog])
  const floor = schedule
    ? Math.min(schedule.start.mental, schedule.start.physical, schedule.start.social, schedule.start.errands)
    : 100
  // `setOverride` is not wired to any control on this screen: §3's low-energy behaviour is
  // now the room screen trimming itself rather than a separate view to exit from, so there
  // is nothing left for a manual override to toggle out of. `useLowEnergy` keeps the
  // capability (and its own tests) for whenever a future settings control wants it.
  const { active: lowEnergy } = useLowEnergy(repository, floor)

  /**
   * §8.1's two prerequisites: anchor the fortnight to a real day, and claim something about a
   * real day two days out. The clock enters here and nowhere deeper.
   */
  useEffect(() => {
    if (!schedule) return

    if (!isAnchored(schedule)) {
      setSchedule(anchorTo(schedule, new Date()))
      return
    }

    const next = predictionsAfter(
      profile.predictions,
      schedule,
      paramsFor(outcomesFrom(blockLog)),
      new Date(),
    )
    if (next.length !== profile.predictions.length) setProfile({ ...profile, predictions: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, profile, blockLog, setSchedule, setProfile])

  if (!schedule) {
    // A sentence rather than a spinner: a spinner tells a student nothing about what is
    // happening.
    return (
      <main className="mx-auto max-w-screen-md p-4">
        <p>Working out where you are…</p>
      </main>
    )
  }

  const week = schedule
  const today = todayIndex(week, new Date()) ?? 0
  const todayDate = dateFor(week, today)
  const model = roomModel({ schedule: week, profile, today, blockLog })

  // §1.1's dial: the reserve, the five domain bars each against its own ceiling, and the
  // low-social-flagged-as-warning logic that is the app's own differentiator over a tracker
  // that would read a quiet week as healthy. Same `checkedIn` wiring as `roomModel.ts`, so
  // the dial and the room agree about what "silent" means.
  const days = toDayInputs(week, checkedInDays(blockLog, today, week.horizonDays))
  const projection = project(week.start, days, params)
  const bars = domainBars(week.start, projection, days)

  async function onRebalance() {
    if (working) return

    setWorking(true)
    // Setting state does not paint on its own and the solver holds the main thread, so
    // without handing control back first React never renders the working state.
    await new Promise((resolve) => setTimeout(resolve, 0))

    try {
      const outcome = runRebalance(week, params, SEED)
      setSchedule(outcome.schedule)
      setReport(outcome.report)
      setFallback(outcome.fallback)
      play()
    } finally {
      setWorking(false)
    }
  }

  function answerBlock(itemId: string, answer: BlockAnswer) {
    const item = week.items.find((candidate) => candidate.id === itemId)
    if (!item) return

    onAnswerBlock({
      blockId: item.id,
      type: item.type,
      plannedHours: item.hours,
      dayIndex: item.dayIndex,
      answer,
      answeredAt: Date.now(),
    })
  }

  const closeToRoom = () => setView(back(view))

  // §3's card precedence: recovery, then a lapsed commitment, then a stuck task, then the
  // day's own question -- capped to one below the low-energy threshold and two otherwise.
  const recoveryPrescription = prescribe(week)
  const lapsedCommitments = lapsed(week, today, params)
  const stuckItem = week.items.find(
    (item) => item.id !== stuckDismissedId && isStuck(item, 0, Math.max(0, today - item.dayIndex)),
  )
  const blockForToday = blockToAsk({ schedule: week, today, blockLog })
  const askEnergy = profile.predictions.some(
    (prediction) => prediction.forDate === todayDate && prediction.reported === null,
  )
  const askSleep = !sleepAnsweredToday
  const showTodayCard = !todayDismissed && (askEnergy || askSleep || blockForToday !== null)

  const cards = visibleCards({
    recovery: !recoveryDismissed && recoveryPrescription !== null,
    lapsed: !lapsedDismissed && lapsedCommitments.length > 0,
    stuck: stuckItem !== undefined,
    today: showTodayCard,
    lowEnergy,
  })

  const isWeekScreen = view.kind === 'week' || view.kind === 'block'
  const blockModel =
    view.kind === 'block' ? blockSheet({ schedule: week, itemId: view.itemId, today, blockLog }) : null

  const paragraph = lowEnergy ? firstSentence(describeRoom(model.state)) : describeRoom(model.state)

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-sm font-semibold tracking-wide text-ink-soft">Codenection</h1>
        <Button
          variant="quiet"
          size="sm"
          data-testid="open-settings"
          onClick={() => setView(toSettings())}
        >
          Settings
        </Button>
      </div>

      {isWeekScreen ? (
        <>
          <Button variant="quiet" size="sm" data-testid="week-back" onClick={() => setView(ROOM)} className="self-start">
            Back to the room
          </Button>
          <WeekScreen
            schedule={week}
            today={today}
            working={working}
            report={report}
            fallback={fallback}
            onRebalance={() => void onRebalance()}
            onSelectBlock={(itemId) => setView(toBlock(itemId))}
            blockLog={blockLog}
          />
        </>
      ) : (
        <>
          {/* The one thing that is not furniture. A student who does not know their week is
              not being saved will lose it, and a warning about data loss must not require
              discovering an object first. */}
          {session === null && <PreviewBanner onSignIn={onSignIn} />}

          <Room model={model} />

          {/* Flagged by Task 12: the drawing's own `aria-label` (`describeRoomFully`) is
              already the complete text equivalent a screen reader needs, and this capped
              paragraph repeats a subset of the same sentences verbatim -- character and
              weather always, in the same words. Left as visible-and-announced, the two
              would read out back to back: the full version, then a partial repeat of it.
              `aria-hidden` keeps it for sighted readers (§1.5, still worth having as
              running text rather than only inside an SVG's accessible name) without
              saying anything twice to assistive tech. */}
          <p data-testid="room-text-equivalent" aria-hidden="true" className="text-sm text-ink-soft">
            {paragraph}
          </p>

          <AccuracyNote predictions={profile.predictions} />

          <LiveCards
            cards={cards}
            recoveryPrescription={recoveryPrescription}
            onRecoveryAccept={(taken) => setSchedule(scheduleRecovery(week, taken))}
            onRecoveryDismiss={() => setRecoveryDismissed(true)}
            lapsedCommitments={lapsedCommitments}
            onLapsedDismiss={() => setLapsedDismissed(true)}
            stuckMicroStart={stuckItem === undefined ? null : firstAction(stuckItem)}
            onStuckStart={() => stuckItem !== undefined && setView(toBlock(stuckItem.id))}
            onStuckDismiss={() => stuckItem !== undefined && setStuckDismissedId(stuckItem.id)}
            blockForToday={blockForToday}
            askEnergy={askEnergy}
            askSleep={askSleep}
            onEnergy={(energy) => {
              if (todayDate === null) return
              setProfile({ ...profile, predictions: resolvePrediction(profile.predictions, todayDate, energy) })
            }}
            onSleep={(bucket) => {
              setSchedule(withSleep(week, today, bucket))
              setSleepAnsweredToday(true)
            }}
            onBlockAnswer={answerBlock}
            onTodayDismiss={() => setTodayDismissed(true)}
          />

          <div className="flex items-center justify-between gap-2">
            {!lowEnergy && (
              <Button variant="quiet" data-testid="open-week" onClick={() => setView(toWeek())}>
                The week
              </Button>
            )}
            <Button
              data-testid="open-add"
              aria-label="Add something"
              onClick={() => setView(toAdd())}
              className="ml-auto"
            >
              +
            </Button>
          </div>

          {/* §1.1: "sits in one corner as a compact readout, no tap required." Placed after
              the room's two permanent controls rather than before them, so the dial's own
              bulk (five domain bars, trends, warnings, its spoken summary) cannot push
              `The week` / `+` below the fold at 320px -- those two stay exactly where they
              already were, and the dial is additional content beneath. Hidden in low-energy
              mode: §1.5's "one number and one action" is the corner gauge already in `Room`
              plus the single live card, and a five-bar breakdown is exactly the dashboard
              §1.5 says a depleted student should not be handed. */}
          {!lowEnergy && (
            <CapacityDial capacity={overallReserve(week.start)} bars={bars} projection={projection} />
          )}
        </>
      )}

      {view.kind === 'block' && blockModel !== null && (
        <BlockSheet
          key={view.itemId}
          model={blockModel}
          onClose={closeToRoom}
          onDone={(itemId) => {
            setSchedule(completeItem(week, itemId))
            closeToRoom()
          }}
          onLater={(itemId) => {
            setSchedule(deferItem(week, itemId))
            closeToRoom()
          }}
          onConfirm={(itemId, answer) => {
            answerBlock(itemId, answer)
            closeToRoom()
          }}
          onRested={(itemId, rested) => {
            answerBlock(itemId, rested ? 'right' : 'didnt')
            closeToRoom()
          }}
        />
      )}

      {view.kind === 'add' && (
        <AddSheet
          key="add"
          schedule={week}
          onAcceptItems={(items) => setSchedule(addItems(week, items))}
          onAcceptRequest={(item) => setSchedule(accept(week, item, today))}
          onClose={closeToRoom}
        />
      )}

      {view.kind === 'settings' && (
        <Sheet key="settings" title="Settings" onClose={closeToRoom}>
          <div className="flex flex-col gap-4">
            {session !== null ? (
              <>
                <AccountBar session={session} onSignOut={onSignOut} />
                <LinkTelegram />
              </>
            ) : (
              <p className="text-sm text-ink-soft">
                Sign in to keep this week and link Telegram to it.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </main>
  )
}
