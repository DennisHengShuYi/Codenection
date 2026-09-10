import { useEffect, useMemo, useState } from 'react'
import type { Repository, Session } from '../../data'
import type { ParsedItem } from '../../ai'
import { isDistressed } from '../../domain/distress'
import { energyHistory } from '../../domain/energyHistory'
import { describePlacement, fixThatMakesRoom, placeItems } from '../../domain/placement'
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
import { domainBars } from '../dial/domainBars'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { Sheet } from '../kit/Sheet'
import { LinkTelegram } from '../settings/LinkTelegram'
import { LowEnergyControl } from '../settings/LowEnergyControl'
import { ReservesSheet } from '../reserves/ReservesSheet'
import { blockToAsk, withSleep } from '../today/checkIn'
import { useLowEnergy } from '../useLowEnergy'
import { useProfile } from '../useProfile'
import { useReducedMotion } from '../useReducedMotion'
import { useSchedule } from '../useSchedule'
import { AccuracyNote } from '../validation/AccuracyNote'
import { BlockSheet } from '../week/BlockSheet'
import { blockSheet } from '../week/blockActions'
import { runRebalance } from '../../domain/rebalanceOutcome'
import { WeekScreen } from '../week/WeekScreen'
import { visibleCards } from './cardPrecedence'
import { LiveCards } from './LiveCards'
import { roomModel } from './roomModel'
import { describeRoom } from './roomText'
import { Room } from './Room'
import { back, ROOM, toAdd, toBlock, toReserves, toSettings, toWeek } from './view'
import { useUrlView } from './useUrlView'
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
  const { profile, setProfile } = useProfile(repository, session)
  /**
   * Ruling 57: where the student is now lives in the address bar as well as in React.
   * `useUrlView` returns exactly what `useState<View>` returned before it, so everything
   * below this line is unchanged -- the URL is a projection of this value, not a second
   * place the app stores it.
   */
  const [view, setView] = useUrlView()
  const [report, setReport] = useState<string | null>(null)
  const [fallback, setFallback] = useState<Fix | null>(null)
  const [working, setWorking] = useState(false)

  // Session-scoped dismissals for the four live cards, none of which has a domain-level
  // "not today" of its own any more. §7 retired the recovery card's permanent
  // failed-recovery log: "not today" is now exactly this kind of same-day dismissal rather
  // than a report that suppressed the advice forever.
  const [distressDismissed, setDistressDismissed] = useState(false)
  const [recoveryDismissed, setRecoveryDismissed] = useState(false)
  const [lapsedDismissed, setLapsedDismissed] = useState(false)
  const [stuckDismissedId, setStuckDismissedId] = useState<string | null>(null)
  const [todayDismissed, setTodayDismissed] = useState(false)
  const [sleepAnsweredToday, setSleepAnsweredToday] = useState(false)

  // What just happened to the things the student added, and the one move that would help if
  // anything had to give. Session-scoped like every other dismissal here: a report on an
  // action they just took, not a state of the week.
  const [placementLines, setPlacementLines] = useState<readonly string[]>([])
  const [placementFix, setPlacementFix] = useState<Fix | null>(null)

  const reducedMotion = useReducedMotion()
  const { play } = useTidyUp(reducedMotion)

  // §8b/Task 17: the durable log is the only source `paramsFor` reads now -- see
  // `roomModel.ts`'s matching call for why the profile's `confirmations` side is gone.
  // Derived once and shared: `paramsFor` pads the week with it, and §7.6's Reality Check
  // line on the today card quotes the very same history back to the student. Two calls
  // would be two chances for the number shown to drift from the number applied.
  const outcomes = useMemo(() => outcomesFrom(blockLog), [blockLog])
  const params = useMemo(() => paramsFor(outcomes, profile.predictions), [outcomes, profile.predictions])
  const floor = schedule
    ? Math.min(schedule.start.mental, schedule.start.physical, schedule.start.social, schedule.start.errands)
    : 100
  // §1.5's mode, read AND written. `setOverride` reaches `LowEnergyControl` in the settings
  // sheet below, which is the whole of Ruling 45: the preference was honoured here while
  // nothing in the app could set it, because the control lived on `LowEnergyView` and Task
  // 17 deleted the view. Both directions matter -- a depleted student turning the collapsed
  // interface off, and a rested student turning it on -- and both are asserted end to end in
  // `RoomShell.lowEnergy.test.tsx` rather than only at the hook.
  const { active: lowEnergy, override: lowEnergyOverride, setOverride } = useLowEnergy(repository, floor)

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
      // The same `params` the week is projected with. It derives purely from `blockLog` and
      // the profile, both already in this effect's dependencies -- recomputing it here was a
      // third copy of one number.
      params,
      new Date(),
      blockLog,
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
  const now = new Date()
  const today = todayIndex(week, now)

  // `todayIndex` returns `null` on purpose (see `calendar.ts`): an unanchored week has no
  // real day to be on, and a week whose fortnight has already elapsed is not "day 0" of a
  // new one either. Collapsing either case to 0 would re-mark every genuinely silent day as
  // checked in (§6.5) and point the whole room at the wrong day -- confidently wrong is
  // worse than honestly unsure. The anchoring effect above already resolves the first case
  // on the next render for a fresh week; what is left here is the elapsed-fortnight case,
  // which this app does not yet have a "start the next one" flow for, so it says so rather
  // than pretending.
  if (today === null) {
    return (
      <main className="mx-auto max-w-screen-md p-4">
        <p data-testid="day-unlocated">
          This fortnight has run its course and the app cannot tell which day you are on.
          Reopen once a new one has started.
        </p>
      </main>
    )
  }

  // Threaded alongside `today` from the same clock read -- see the comment above this
  // effect block: the clock enters here and nowhere deeper, so `checkIn.ts` takes it as a
  // parameter rather than reading one itself.
  const nowHour = now.getHours()
  const todayDate = dateFor(week, today)
  const model = roomModel({ schedule: week, today, blockLog, predictions: profile.predictions })

  // §1.2's breakdown: the five domain bars each against its own ceiling, and the
  // low-social-flagged-as-warning logic that is the app's own differentiator over a tracker
  // that would read a quiet week as healthy. Computed here, where the engine call already
  // is, and handed to `WeekScreen` -- Ruling 53 moved the breakdown off the room so the
  // room reads capacity once, through `Room`'s own corner gauge. Same `checkedIn` wiring as
  // `roomModel.ts`, so the breakdown and the room agree about what "silent" means.
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

  // A `const` arrow rather than a declaration: declarations hoist above the `today === null`
  // guard, so TypeScript could not narrow the day away and `placeItems` would be handed a
  // possibly-null one.
  const acceptItems = (items: readonly ParsedItem[]) => {
    const { schedule: next, notes } = placeItems(week, items, today)
    setSchedule(next)

    const moved = notes.filter((note) => note.movedFrom !== null || !note.fitted)
    setPlacementLines(notes.map((note) => describePlacement(note, next)))

    // Only when something actually had to give -- a week that simply absorbed the new work
    // has nothing to offer and nothing to apologise for -- and only a move that opens room
    // on the day that failed. `smallestFixes` ranks by deficit days and floor, which is a
    // different question, so its top move was often true and entirely unrelated to what the
    // student had just been told did not fit.
    const first = moved[0]
    const wanted = items.find((item) => first !== undefined && first.title === item.title)

    setPlacementFix(
      first === undefined || wanted === undefined
        ? null
        : fixThatMakesRoom(next, wanted, first.movedFrom ?? first.dayIndex, params),
    )
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
  const lapsedCommitments = lapsed(week, today, params, blockLog)
  const stuckItem = week.items.find(
    (item) => item.id !== stuckDismissedId && isStuck(item, Math.max(0, today - item.dayIndex)),
  )
  const blockForToday = blockToAsk({ schedule: week, today, nowHour, blockLog })
  const askEnergy = profile.predictions.some(
    (prediction) => prediction.forDate === todayDate && prediction.reported === null,
  )
  const askSleep = !sleepAnsweredToday
  const showTodayCard = !todayDismissed && (askEnergy || askSleep || blockForToday !== null)

  // §8's floor case. Read off what the student reported rather than the modelled reserves: a
  // claim this serious must rest on what they actually said, not on the app's guess.
  const reportedEnergy = energyHistory(profile.predictions)

  const cards = visibleCards({
    distress: !distressDismissed && isDistressed(reportedEnergy),
    recovery: !recoveryDismissed && recoveryPrescription !== null,
    lapsed: !lapsedDismissed && lapsedCommitments.length > 0,
    stuck: stuckItem !== undefined,
    today: showTodayCard,
    lowEnergy,
  })

  const blockModel =
    view.kind === 'block' ? blockSheet({ schedule: week, itemId: view.itemId, today, blockLog }) : null

  const paragraph = lowEnergy ? firstSentence(describeRoom(model.state)) : describeRoom(model.state)

  /**
   * The three sheets, written once and rendered by whichever screen is showing. They were
   * inside the one `<main>` when the room and the week shared a layout; the room screen is
   * its own full-bleed stage now (Ruling 54), and duplicating forty lines of sheet wiring
   * across the two branches is how one of them quietly stops opening.
   */
  const sheets = (
    <>
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
          way={view.way}
          onWay={(way) => setView(toAdd(way))}
          schedule={week}
          params={params}
          today={today}
          blockLog={blockLog}
          predictions={profile.predictions}
          onAcceptItems={(items) => acceptItems(items)}
          onAcceptRequest={(item) => setSchedule(accept(week, item, today))}
          onClose={closeToRoom}
        />
      )}

      {view.kind === 'week' && (
        <Sheet key="week" title="The week" size="wide" onClose={closeToRoom}>
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
        </Sheet>
      )}

      {/* Ruling 56's gate, moved with what it guards. §1.5: "a student at 12% reserve
          should not be handed a dashboard". In low-energy mode the gauge is not a door
          either, so this is a path that does not exist rather than a door that refuses --
          and an address typed by hand lands on the room. */}
      {view.kind === 'reserves' && !lowEnergy && (
        <ReservesSheet
          key="reserves"
          capacity={overallReserve(week.start)}
          bars={bars}
          projection={projection}
          history={reportedEnergy}
          onClose={closeToRoom}
        />
      )}

      {view.kind === 'settings' && (
        <Sheet
          key="settings"
          title="Settings"
          onClose={closeToRoom}
          // §0.2's lower-half-primary rule: sign-out is the one real action this sheet
          // offers, so it belongs in the pinned bar rather than inside `AccountBar`'s own
          // scrolling body -- the same place every other sheet puts its actions.
          actions={
            session !== null ? (
              <Button variant="quiet" onClick={onSignOut}>
                Sign out
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-4">
            {/* First, and above the account rows on purpose. This is the one setting that
                changes what the student can see, and the one a student in low-energy mode
                came here for -- putting it under sign-in and Telegram would make the way
                out of a collapsed interface the last thing on the page. It is also the
                only part of this sheet that works signed out. */}
            <LowEnergyControl value={lowEnergyOverride} onChange={setOverride} />

            {session !== null ? (
              <>
                <AccountBar session={session} />
                <LinkTelegram />
              </>
            ) : (
              // Ruling 58: a row rather than a sentence floating in an acre of white. Same
              // words, given the same shape as the rows above it.
              <p className="rounded-xl border border-line p-3 text-sm text-ink-soft">
                Sign in to keep this week and link Telegram to it.
              </p>
            )}
          </div>
        </Sheet>
      )}
    </>
  )

  /**
   * `secondary` rather than `quiet`: on the room screen this button sits over the drawing,
   * and an underlined text link over a wall wash and a ceiling beam is a control the eye
   * has to hunt for. It carries its own surface instead, the same way the corner gauge does.
   */
  const settingsButton = (
    <Button
      variant="secondary"
      size="sm"
      data-testid="open-settings"
      onClick={() => setView(toSettings())}
    >
      Settings
    </Button>
  )

  /**
   * The room screen (Rulings 54 and 55).
   *
   * The room is the whole screen -- no title bar above it, no button row below it -- and
   * everything else rides over it: one control row across the top holding `Settings`,
   * `The week` and `+`, and one band along the bottom holding the paragraph, the accuracy
   * line and the live cards.
   *
   * Overlaid controls have failed here once already (PR #39: they "covered the furniture
   * and swallowed its clicks -- the phone was unreachable from 768px up"). Half of that
   * cannot recur -- the drawing is display-only, so there is nothing inside it left to
   * swallow a click from. The half that can is occlusion, and the thing that must not be
   * occluded is the character: it is how this app says how the student is doing and nothing
   * else expresses it. Two things keep it legible, and the band is measured against the
   * character's own box at 320/390/768/1280 in `room.spec.ts`:
   *
   * 1. The scene is composed clear of the band. The fill framing draws into a 260-unit
   *    viewBox aligned to the top of the stage, so the furniture and the character occupy
   *    the upper 150 units and the floor runs on beneath them. The band is then capped at
   *    the space that leaves: the character's box ends at `CHARACTER_BOTTOM` (157) of the
   *    viewBox's 260 units and the drawing is scaled by `min(stageWidth / 300,
   *    stageHeight / 260)`, so the character's lowest point is at
   *    `min(52.33vw, 60.38% of the stage)` and the band may have everything below it, less
   *    a finger's margin. A single flat percentage cannot express that -- 36% is right for
   *    a laptop and throws away half the band on a 320x568 phone, where the drawing is
   *    limited by width and the character sits far higher up the screen.
   *    The height term is `%` of this stage rather than `dvh` on purpose: `App` puts the
   *    degraded-storage notice in the same column as the stage, so the stage is sometimes
   *    shorter than the viewport and a `dvh` cap would be measured against a height it does
   *    not have. Both figures are re-derived from `CHARACTER_BOTTOM` in
   *    `RoomShell.room.test.tsx`, and the artwork is measured against it in
   *    `Character.test.tsx`, so the cap and the drawing can no longer drift apart in
   *    silence.
   * 2. The band is translucent over a blur, so where it does cross the floor the room is
   *    still visibly behind it rather than replaced by a panel.
   *
   * The three controls share the top row rather than being split between the top corner and
   * the band. That trades the lower-half-primary rule -- the primary action belongs where a
   * thumb is -- for a single place to look for a control; what it keeps is the reason they
   * left the band's scrolling region in the first place, since a tall card can no longer
   * push `The week` or `+` anywhere. `room.spec.ts` still hit-tests all three at four
   * viewports, so the row may not drift under the band or off the screen in silence.
   *
   * Every one of these is a SIBLING of the `<svg>`, never a child: the drawing carries
   * `role="img"`, which hides its whole subtree from the accessibility tree, so a control
   * placed inside it would be invisible to a screen reader while looking perfectly correct.
   */
  return (
    <>
      <main
        data-testid="room-stage"
        /**
         * Ruling 59: every destination is now a sheet over a LIVE room, so the gauge, `+` and
         * whatever the visible card offers are still in the document behind the panel. The
         * backdrop stops the mouse; only this stops Tab and the screen reader, which is what
         * `aria-modal="true"` on the panel claims. React renders the attribute only when it
         * is true, so the room is ordinary again the moment the sheet closes.
         */
        inert={view.kind !== 'room'}
        /* `h-dvh` standing alone -- 34 render sites drop this component straight into the
           document body -- and `flex-1 min-h-0` when `App` puts it in a column beside the
           degraded-storage notice, where it must take what is left of the viewport rather
           than a second full one. In a non-flex parent the two flex declarations are inert,
           so the standalone behaviour is unchanged. */
        className="relative h-dvh w-full min-h-0 flex-1 overflow-hidden"
      >
        {/* The room screen has no visible title -- the room is the title. The heading stays
            for the document outline and for anyone navigating by heading. */}
        <h1 className="sr-only">Codenection</h1>

        <Room
          model={model}
          frame="fill"
          // Ruling 59: the compact readout is the way in to the full one. Withheld in
          // low-energy mode, where the breakdown behind it is withheld too.
          onOpenReserves={lowEnergy ? undefined : () => setView(toReserves())}
        />

        {/* One control row across the top of the room, packed to the left: `Settings`, then
            `The week`, then `+` beside it. The row stops where its buttons stop, leaving the
            opposite corner to the gauge. */}
        <div className="absolute left-2 top-2 flex items-center gap-2">
          {settingsButton}
          {!lowEnergy && (
            <Button variant="secondary" data-testid="open-week" onClick={() => setView(toWeek())}>
              The week
            </Button>
          )}
          <Button data-testid="open-add" aria-label="Add something" onClick={() => setView(toAdd())}>
            +
          </Button>
        </div>

        <section
          data-testid="room-band"
          className="absolute inset-x-0 bottom-0 flex max-h-[calc(100%-min(52.33vw,60.38%)-1rem)] flex-col gap-3 border-t border-line bg-surface/85 p-3 backdrop-blur-sm"
        >
          <div
            data-testid="room-band-content"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
          >
            {/* The one thing that is not furniture, and first in the band for that reason. A
                student who does not know their week is not being saved will lose it, and a
                warning about data loss must not be something they scroll to. */}
            {session === null && <PreviewBanner onSignIn={onSignIn} />}

            {/* Flagged by Task 12: the drawing's own `aria-label` (`describeRoomFully`) is
                already the complete text equivalent a screen reader needs, and this capped
                paragraph repeats a subset of the same sentences verbatim -- character and
                weather always, in the same words. Left as visible-and-announced, the two
                would read out back to back: the full version, then a partial repeat of it.
                `aria-hidden` keeps it for sighted readers (still worth having as running text
                rather than only inside an SVG's accessible name) without saying anything
                twice to assistive tech. */}
            <p data-testid="room-text-equivalent" aria-hidden="true" className="text-sm text-ink-soft">
              {paragraph}
            </p>

            {/* §16: never silently reshuffle. What was added, where it went, and -- only when
                something had to give -- the single move that would help, offered rather than
                taken. "Leave it" is the healthy default: doing nothing keeps the week the
                student decided on. */}
            {placementLines.length > 0 && (
              <Card role="status" data-testid="placement-note" className="flex flex-col gap-2">
                {placementLines.map((line, index) => (
                  <p key={`${line}-${index}`} className="text-sm">
                    {line}
                  </p>
                ))}

                {placementFix !== null && (
                  <>
                    <p className="text-sm text-ink-soft">Or: {placementFix.move.description}.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        data-testid="placement-do"
                        onClick={() => {
                          setSchedule(placementFix.move.apply(week))
                          setPlacementLines([])
                          setPlacementFix(null)
                        }}
                      >
                        Do that
                      </Button>
                      <Button
                        variant="quiet"
                        size="sm"
                        data-testid="placement-leave"
                        onClick={() => {
                          setPlacementLines([])
                          setPlacementFix(null)
                        }}
                      >
                        Leave it
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            )}

            <AccuracyNote predictions={profile.predictions} />

            <LiveCards
              cards={cards}
              onDistressDismiss={() => setDistressDismissed(true)}
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
              outcomes={outcomes}
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
          </div>
        </section>

        </main>

      {/* OUTSIDE the stage, deliberately. The stage goes `inert` while a sheet is open, and
          `inert` applies to a whole subtree -- a sheet rendered inside it would be dimmed,
          untabbable and unclickable, which is the modal refusing every click made at it.
          jsdom does not implement `inert`, so only `room.spec.ts` and `dial.spec.ts` can
          catch that; `RoomShell.weekModal.test.tsx` asserts the containment instead. */}
      {sheets}
    </>
  )
}
