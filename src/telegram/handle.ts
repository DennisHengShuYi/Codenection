import { MAX_IMAGE_BYTES, MAX_INPUT_LENGTH, parseBrainDump, type Calendar, type ParsedItem } from '../ai'
import { calendarFor, dateFor, dayLabel, todayIndex } from '../domain/calendar'
import { blocksOnDay } from '../domain/dayBlocks'
import { answeredIds, checkedInDays, outcomesFrom, type BlockAnswer, type BlockRecord } from '../domain/blockLog'
import type { BlockOutcome } from '../domain/calibration'
import { accept, lapsed } from '../domain/commitments'
import { paramsFor } from '../domain/engineParams'
import type { EnergyPrediction } from '../domain/predictions'
import { accuracyLine, resolvePrediction } from '../domain/predictions'
import { biasLine } from '../domain/realityCheck'
import { runRebalance } from '../domain/rebalanceOutcome'
import { scheduleView } from '../domain/scheduleView'
import { stampSoftDeadlines } from '../domain/softDeadlines'
import type { SleepNight } from '../domain/sleepLog'
import { SLEEP_HOURS, withSleep } from '../ui/today/checkIn'
import { firstAction } from '../domain/microStart'
import { prescribe } from '../domain/prescribe'
import { scheduleRecovery } from '../domain/scheduleRecovery'
import { overallReserve, project, type LoadType } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { tooLongToTranscribe } from './audio'
import { resolveConfirmation, summarise, type PendingDump } from './brainDump'
import {
  askReply,
  askUnavailableReply,
  restUnavailableReply,
  askUnreadableReply,
  blockAnsweredReply,
  blocksReply,
  discardedReply,
  checkedInReply,
  checkInReply,
  checkInUnavailableReply,
  lapsedReply,
  needDayReply,
  scheduleReply,
  takenOnReply,
  rebalanceReply,
  weekReply,
  helpReply,
  linkedReply,
  microStartReply,
  needRequestReply,
  needTaskReply,
  noGapReply,
  taskNotFoundReply,
  nothingUnderstoodReply,
  photoTooBigReply,
  photoUnavailableReply,
  photoUnreadableReply,
  notLinkedReply,
  restBookedReply,
  restReply,
  tooLongReply,
  transcriptionUnavailableReply,
  voiceTooLongReply,
  unhandledReply,
  yesterdayUnavailableReply,
  type Reply,
  rebalanceDeclinedReply,
  rebalanceStaleReply,
} from './render'
import type { Intent } from './update'

/**
 * The calls that need a credential, injected rather than imported.
 *
 * Every one of these lives behind `api/`, which is the only place a key is read. Passing
 * them in keeps this module testable without one, and keeps the browser bundle unable to
 * reach any of them. An absent service is an ordinary state, not an error: it means the key
 * is unset, which is CI, the demo, and any deployment before its variables are filled in.
 */
export interface ChatServices {
  readonly askModel?: (prompt: string) => Promise<string | null>
  /**
   * Reads a request, prices it against the week, and drafts the three replies.
   *
   * One service rather than three, because §2.3's answer is all of it or none: a cost with
   * no drafts is a number to worry about with nothing to do, and drafts with no cost are
   * three sentences about a decision nobody has been helped to make. `api/telegram.ts`
   * composes readRequest, priceRequest and draftReplies behind it -- all three from #26,
   * unchanged.
   *
   * Null means the request could not be read, which is said plainly rather than priced as
   * something invented.
   */
  /**
   * Fetches the image from Telegram and runs the app's own reader over it. Null when it
   * could not be read at all.
   *
   * `calendar` is Ruling 44's anchor, and this had no parameter to carry it -- so the bot called
   * `readPhoto` with one argument while the app's own screen passed a calendar. `readPhoto`
   * itself says why that matters most here: "a photographed timetable is mostly weekdays,
   * which makes this the reader that needed the anchor most and got it last". Without it
   * every "Tuesday" on a photographed roster was resolved against a guess, so the same
   * timetable sent through chat landed on different days than through the app.
   */
  readonly readPhotoFile?: (
    fileId: string,
    calendar?: Calendar,
  ) => Promise<readonly ParsedItem[] | null>
  /** Fetches the audio from Telegram and transcribes it. Null when transcription failed. */
  readonly transcribe?: (fileId: string) => Promise<string | null>
  /**
   * Ruling 41: `today` and `blockLog` are parameters rather than something this service
   * invents. `/ask` used to price against day 0 of the fortnight whatever day it was, with
   * no check-in evidence -- while `RequestBoxScreen` passed both, so the same request got
   * two different prices depending on which door it came through. Required, not optional:
   * `priceRequest`'s own optional defaults are what let the wrong call compile in the first
   * place, and an optional parameter here would put the same trap back one level up.
   */
  readonly priceAsk?: (
    text: string,
    week: Schedule,
    today: number,
    blockLog: readonly BlockRecord[],
  ) => Promise<{
    cost: {
      firstDeficitDayBefore: number | null
      firstDeficitDayAfter: number | null
      eveningsEquivalent: number
    }
    drafts: readonly { tone: 'decline' | 'defer' | 'accept'; text: string }[]
    /** The request as read, so §2.3's provisional yes has something real to accept without
     *  re-reading the text and risking a different answer. */
    item: ParsedItem
  } | null>
}

/**
 * Which day index "today" is.
 *
 * The week now carries a real date (`startedOn`), so this is a lookup rather than a
 * convention. A week saved before anchoring existed has none, and falls back to day 0 --
 * which is what every other part of the model still assumes for an unanchored week.
 */
const todayFor = (week: Schedule, now: number): number => todayIndex(week, new Date(now)) ?? 0

/**
 * Where the student is in the fortnight and in the day, for `blocksReply`.
 *
 * The hour is the student's own, from the same `Date` every other reading here comes from.
 * Without it the bot asked how an 8pm block went at 9am -- and `/day` asked about days that
 * had not arrived -- while the today card, which has always had a clock, asked neither.
 */
const nowFor = (week: Schedule, now: number): { today: number; hour: number } => ({
  today: todayFor(week, now),
  hour: new Date(now).getHours(),
})

/** §2.1's search takes its randomness as a parameter. The same seed the app uses, so a
 *  student who rebalances in chat and then in the app is not shown two different weeks. */
const REBALANCE_SEED = 20260908

/**
 * §7.6's line, for whichever load type the app actually has evidence about.
 *
 * The app can put this beside the block it is asking about; chat has no block in hand, so
 * it picks the type with the most logged history. A bias quoted about a type the student
 * has never logged is a claim about nothing, and `biasLine` already returns null below
 * `MIN_SAMPLES` -- this only chooses which question to ask it.
 */
function bestMeasuredBias(outcomes: readonly BlockOutcome[]): string | null {
  const counted = new Map<LoadType, number>()
  for (const outcome of outcomes) {
    counted.set(outcome.type, (counted.get(outcome.type) ?? 0) + 1)
  }

  const best = [...counted.entries()].sort((a, b) => b[1] - a[1])[0]

  return best === undefined ? null : biasLine(outcomes, best[0])
}

/**
 * Everything the chat flows need from storage, and nothing more.
 *
 * An interface rather than a Supabase client so that all of the decisions below are
 * testable without a database — and, more importantly, so that the one place holding the
 * service-role key stays `api/telegram.ts` and never spreads into `src/`.
 *
 * Every method takes the account explicitly. A chat id is never an identity: it is resolved
 * to an account once, at the top of `handleIntent`, and everything after works from that.
 */
export interface ChatStore {
  /** The account a chat is linked to, or null when it is not linked. */
  accountForChat(chatId: number): Promise<string | null>
  /** Spends a linking code, returning the account it belonged to. Null when it is unknown,
   *  expired, or already used — the caller is not told which. */
  claimLinkCode(code: string, now: number): Promise<string | null>
  linkChat(chatId: number, accountId: string): Promise<void>
  loadWeek(accountId: string): Promise<Schedule>
  saveWeek(accountId: string, week: Schedule): Promise<void>
  savePending(accountId: string, pending: PendingDump): Promise<void>
  findPending(accountId: string, dumpId: string): Promise<PendingDump | null>
  markAnswered(accountId: string, dumpId: string, now: number): Promise<void>
  /** §8b②'s evidence, at last read by something: Reality Check (§2.4) and the carryover
   *  matrix (§6.6) both consume the durable block log this writes into. */
  recordBlockAnswer(accountId: string, answer: BlockAnswerInput, now: number): Promise<void>
  /**
   * §8's answered night, recorded as an answer rather than only written into the week.
   *
   * Upserts on the night's date. Without this the bot's claim that a night reported here and
   * one reported in the app are the same fact was only half true: `withSleep` put the figure
   * in the week, and nothing recorded that anybody had been *asked* -- so the app went on
   * asking, and `domain/sleepReality` could not count the night as evidence.
   */
  recordSleepNight(accountId: string, night: SleepNight): Promise<void>
  /**
   * The same durable log `recordBlockAnswer` writes into, read back.
   *
   * §2.4's evidence and §6.5's missing-data pessimism are both computed from it, and
   * `/ask` needs both to quote the same price the app's own request box quotes. Rejects
   * rather than returning `[]` when it cannot be read: an empty log and an unreadable one
   * mean opposite things -- "this student has answered nothing" versus "we do not know" --
   * and collapsing them prices a request on evidence nobody has.
   */
  loadBlockLog(accountId: string): Promise<readonly BlockRecord[]>
  /**
   * §8.1's resolved predictions, from the same `user_state.settings` blob the app reads.
   *
   * Here so the bot can publish the accuracy figure it measured, and -- more importantly --
   * so `paramsFor` gets the recovery coefficients the prediction loop has learned. Without
   * it a request priced in chat runs a different model from the same request priced in the
   * app, which is Ruling 41's failure exactly.
   *
   * Resolves to empty rather than rejecting when there is no profile yet: a student who has
   * answered nothing is an ordinary state, unlike an unreadable block log.
   */
  loadPredictions(accountId: string): Promise<readonly EnergyPrediction[]>
  /**
   * Writes §8.1's predictions back, for a check-in answered in chat.
   *
   * Only the predictions, never the whole settings blob: the app writes that whole and a
   * bot writing it too would race the browser and lose whichever wrote first.
   */
  savePredictions(accountId: string, predictions: readonly EnergyPrediction[]): Promise<void>
}

/**
 * What `recordBlockAnswer` needs to write a `BlockRecord` (minus `answeredAt`, which is
 * `now`) -- §8b②'s evidence, carried through the callback because a week is one jsonb blob
 * and `blockId` has nothing else to join against.
 */
export interface BlockAnswerInput {
  readonly blockId: string
  readonly type: LoadType
  readonly plannedHours: number
  readonly dayIndex: number
  readonly answer: BlockAnswer
}

/** Distinct per dump so a button can only ever answer the parse it was attached to. */
const newDumpId = (): string => crypto.randomUUID()

/**
 * Stores a parse as pending and offers it, whichever door it came through.
 *
 * Typing, speaking and photographing all end here, because §3.2's rule does not care how
 * the items were read: they are proposals until the student approves them.
 */
async function offerParse(
  store: ChatStore,
  accountId: string,
  items: readonly ParsedItem[],
): Promise<Reply> {
  if (items.length === 0) return nothingUnderstoodReply()

  const dumpId = newDumpId()
  await store.savePending(accountId, { id: dumpId, items, answeredAt: null })

  return summarise(dumpId, { items, source: 'model' })
}

/**
 * Decides what happens for one intent, and what to say back.
 *
 * Returns the reply rather than sending it, so every decision here is testable without a
 * network. Null means there is nothing to answer — no chat to answer to.
 */
/**
 * Ruling 62/Ruling 44: which real day day 0 is, for the reader this door calls.
 *
 * The app hands `parseBrainDump` a calendar so a stated weekday lands on that weekday; this
 * door handed it nothing, so the model was left to guess -- and chat is where a student is
 * most likely to say "thursday" rather than a date. A week that has never been dated yields
 * a calendar with no label, which both readers already treat as "say nothing about today".
 */
/**
 * A short, stable fingerprint of the week a proposal was made against (Ruling 62).
 *
 * The proposal itself cannot travel in 64 bytes of callback data, so approving it re-runs
 * the same deterministic solve -- and this is what proves the re-run would see the same
 * week. A week that has moved on since is refused rather than rearranged by a plan made for
 * a different one.
 *
 * Not a security boundary and not trying to be: it is an accident detector, and a student
 * cannot gain anything by forging their own week's fingerprint. Cheap enough to compute on
 * every `/rebalance`, which is why it is a fold rather than a hash import.
 */
const fingerprintOf = (week: Schedule): string => {
  const shape = week.items
    .map((item) => `${item.id}:${item.dayIndex}:${item.startHour}:${item.hours}`)
    .sort()
    .join('|')

  let hash = 0
  for (let index = 0; index < shape.length; index += 1) {
    hash = (hash * 31 + shape.charCodeAt(index)) | 0
  }

  return Math.abs(hash).toString(36)
}

const calendarOf = async (
  store: ChatStore,
  accountId: string,
  now: number,
): Promise<Calendar | undefined> => {
  const week = await store.loadWeek(accountId).catch(() => null)
  if (week === null) return undefined

  const today = todayFor(week, now)

  return calendarFor(week, today)
}

export async function handleIntent(
  intent: Intent,
  store: ChatStore,
  now: number,
  services: ChatServices = {},
): Promise<Reply | null> {
  if (intent.kind === 'unhandled') {
    return intent.chatId === null ? null : unhandledReply()
  }

  // Linking is the one thing an unlinked chat may do, so it is handled before the guard.
  if (intent.kind === 'link') {
    const accountId = await store.claimLinkCode(intent.code, now)

    // Unknown, expired and already-used are answered identically. Telling them apart would
    // help somebody work out whether a code they guessed ever existed.
    if (accountId === null) return notLinkedReply()

    await store.linkChat(intent.chatId, accountId)
    return linkedReply()
  }

  // Nothing about an account happens for a chat we have not verified: no parse, no write,
  // no pending record. §13.4.
  const accountId = await store.accountForChat(intent.chatId)
  if (accountId === null) return notLinkedReply()

  /**
   * Which blocks §8b's log already holds an answer for.
   *
   * Fails closed, and the direction matters. If the log cannot be read we return every id
   * on the week rather than none, so the day is still listed but nothing is asked about.
   * The alternative -- treating an unreadable log as empty -- would ask a student to
   * re-answer a block they had already answered and overwrite the real record with it,
   * which is the same "assume rather than admit" failure `73efd65` removed from pricing.
   */
  const answeredSoFar = async (week: Schedule): Promise<readonly string[]> => {
    try {
      return answeredIds(await store.loadBlockLog(accountId))
    } catch {
      // Every id on the week, so `blocksReply` finds nothing left to ask about.
      return week.items.map((item) => item.id)
    }
  }

  if (intent.kind === 'command') {
    switch (intent.name) {
      case 'help':
        return helpReply()

      case 'today': {
        const week = await store.loadWeek(accountId)
        return blocksReply(
          'today',
          blocksOnDay(week, todayFor(week, now)),
          await answeredSoFar(week),
          nowFor(week, now),
        )
      }

      case 'yesterday': {
        const week = await store.loadWeek(accountId)
        const today = todayIndex(week, new Date(now))

        // Unanchored, or the week began today: either way there is no yesterday inside it,
        // and answering with some other day would put wrong data into the table §2.4 will
        // later trust.
        if (today === null || today < 1) return yesterdayUnavailableReply()

        return blocksReply(
          'yesterday',
          blocksOnDay(week, today - 1),
          await answeredSoFar(week),
          nowFor(week, now),
        )
      }

      /**
       * Ruling 22: the state of the fortnight, which chat could not see at all.
       *
       * Every figure is computed by the same functions the room and the dial read -- the
       * projection, `accuracyLine`, `biasLine` -- so the two doors cannot quote a student
       * two different weeks. `biasLine` is asked about the load type they have most
       * history for, since a bias about a type they have never logged is nothing.
       */
      case 'week': {
        const week = await store.loadWeek(accountId)
        const today = todayFor(week, now)
        const blockLog = await store.loadBlockLog(accountId).catch(() => null)
        if (blockLog === null) return askUnavailableReply()

        const predictions = await store.loadPredictions(accountId).catch(() => [])
        const outcomes = outcomesFrom(blockLog)
        const params = paramsFor(outcomes, predictions)
        const projection = project(
          week.start,
          toDayInputs(week, checkedInDays(blockLog, today, week.horizonDays)),
          params,
        )

        return weekReply({
          reserve: Math.round(overallReserve(week.start)),
          firstDeficitDayLabel:
            projection.firstDeficitDay === null
              ? null
              : dayLabel(week, projection.firstDeficitDay, today),
          accuracy: accuracyLine(predictions),
          bias: bestMeasuredBias(outcomes),
        })
      }

      /**
       * Ruling 22: the fortnight at a glance, which chat could not see at all.
       *
       * The same `scheduleView` the week grid renders, so the two doors cannot disagree
       * about which days are heavy or where the deficit starts.
       */
      case 'schedule': {
        const week = await store.loadWeek(accountId)
        const blockLog = await store.loadBlockLog(accountId).catch(() => null)
        if (blockLog === null) return askUnavailableReply()

        const predictions = await store.loadPredictions(accountId).catch(() => [])

        return scheduleReply(
          scheduleView({ schedule: week, today: todayFor(week, now), blockLog, predictions }),
        )
      }

      /** §8's daily check-in, in two taps rather than a screen. */
      case 'checkin':
        return checkInReply(intent.argument.trim() === 'sleep' ? 'sleep' : 'energy')

      /** Ruling 22: any day of the fortnight, not only today and yesterday. */
      case 'day': {
        const asked = Number.parseInt(intent.argument, 10)
        const week = await store.loadWeek(accountId)

        // Refused rather than clamped. A student who typed 40 and got day 20 would be
        // reading a day they did not ask for and had no way to know they were reading.
        if (!Number.isInteger(asked) || asked < 0 || asked >= week.horizonDays) {
          return needDayReply(week.horizonDays)
        }

        return blocksReply(
          'today',
          blocksOnDay(week, asked),
          await answeredSoFar(week),
          nowFor(week, now),
        )
      }

      /**
       * Ruling 22: the same rebalance the week screen runs, through `runRebalance` -- which now
       * lives in `src/domain` for exactly this reason. Two rearranging algorithms with
       * different logic would disagree, and the one that ran last would win.
       */
      /**
       * Ruling 62: proposes, and changes nothing. The app was made to work this way by
       * `c81da05`, and this door went on saving the result the moment the command arrived
       * -- the same word rearranging a student's week behind them through one door and
       * asking first through the other.
       */
      case 'rebalance': {
        const week = await store.loadWeek(accountId)
        const blockLog = await store.loadBlockLog(accountId).catch(() => null)
        if (blockLog === null) return askUnavailableReply()

        const predictions = await store.loadPredictions(accountId).catch(() => [])
        const outcome = runRebalance(
          week,
          paramsFor(outcomesFrom(blockLog), predictions),
          REBALANCE_SEED,
        )

        return rebalanceReply(
          outcome.report,
          outcome.fallback?.move.description ?? null,
          fingerprintOf(week),
        )
      }

      /** §2.3: a provisional yes that stopped being affordable, said out loud. */
      case 'lapsed': {
        const week = await store.loadWeek(accountId)
        const blockLog = await store.loadBlockLog(accountId).catch(() => null)
        if (blockLog === null) return askUnavailableReply()

        const predictions = await store.loadPredictions(accountId).catch(() => [])

        return lapsedReply(
          lapsed(week, todayFor(week, now), paramsFor(outcomesFrom(blockLog), predictions), blockLog),
        )
      }

      case 'rest': {
        const week = await store.loadWeek(accountId)
        const blockLog = await store.loadBlockLog(accountId).catch(() => null)
        // Ruling 41 again: the evidence is a required argument, so a caller that cannot
        // read it says so rather than quietly passing an empty log, which would read as
        // "nothing has been kept up" and prescribe against a fiction.
        if (blockLog === null) return restUnavailableReply()

        // Ruling 62/Ruling 45: stamped first. `missedSoftDeadlines` skips any item with no
        // stamp, and only `RoomShell` was stamping -- so this door reported nothing
        // neglected where the screen would have shown a prescription.
        const today = todayFor(week, now)
        const prescription = prescribe(stampSoftDeadlines(week, today, blockLog), today, blockLog)

        // Null covers both "nothing has gone neglected" and "there is no room", which
        // prescribe() deliberately does not distinguish -- either way there is one honest
        // answer and it is not a suggestion.
        return prescription === null ? noGapReply() : restReply(prescription)
      }

      case 'stuck': {
        if (intent.argument === '') return needTaskReply()

        const week = await store.loadWeek(accountId)

        // Matched against a real block rather than answered from the words alone. §4.1's
        // first move depends on what kind of work it is -- opening a document is the right
        // move for an essay and the wrong one for a run -- and only the schedule knows.
        const wanted = intent.argument.toLowerCase()
        const item = week.items.find((block) => block.title.toLowerCase().includes(wanted))

        if (item === undefined) return taskNotFoundReply()

        return microStartReply(firstAction(item))
      }

      case 'ask': {
        if (intent.argument === '') return needRequestReply()
        if (!services.priceAsk) return askUnavailableReply()

        const week = await store.loadWeek(accountId)

        // Read before pricing and NOT collapsed to `[]` on failure. Migration 0005 adds the
        // columns this reads and is not applied automatically, so an unmigrated deployment
        // fails here -- which must be said rather than quietly priced as "answered
        // nothing". Ruling 42.
        const blockLog = await store.loadBlockLog(accountId).catch(() => null)
        if (blockLog === null) return askUnavailableReply()

        // One reading of the day, shared by the price and the sentence about it -- two
        // `todayFor` calls would be two chances for them to describe different days.
        const askDay = todayFor(week, now)
        const priced = await services
          .priceAsk(intent.argument, week, askDay, blockLog)
          .catch(() => null)

        if (priced === null) return askUnreadableReply()

        /**
         * Still nothing sent to anybody: §2.3 prices a request, and answering the other
         * person stays the student's own act in their own words. What is stored is the
         * request as read, so the "take it on" button has something real to accept -- and
         * the accept writes only to their own week, as a commitment with a review day.
         */
        const askId = newDumpId()
        await store.savePending(accountId, { id: askId, items: [priced.item], answeredAt: null })

        return askReply(
          priced.cost,
          priced.drafts,
          priced.cost.firstDeficitDayAfter === null
            ? null
            : dayLabel(week, priced.cost.firstDeficitDayAfter, askDay),
          askId,
        )
      }
    }
  }

  if (intent.kind === 'blockAnswer') {
    await store.recordBlockAnswer(
      accountId,
      {
        blockId: intent.blockId,
        type: intent.type,
        plannedHours: intent.plannedHours,
        dayIndex: intent.dayIndex,
        answer: intent.answer,
      },
      now,
    )

    // The week is deliberately untouched. These answers are evidence for §2.4 and §6.6,
    // and a check-in that quietly edited the schedule would be acting on data nobody has
    // validated yet.
    return blockAnsweredReply(intent.answer)
  }

  /**
   * Ruling 62: the approval half. The plan is re-run rather than carried, because a whole
   * schedule does not fit in 64 bytes of callback data -- the solve is deterministic on a
   * fixed seed, so the same week yields the same plan. If the week has moved on since the
   * offer, the fingerprint no longer matches and nothing is touched.
   */
  if (intent.kind === 'rebalanceAnswer') {
    if (!intent.accepted) return rebalanceDeclinedReply()

    const week = await store.loadWeek(accountId)
    if (fingerprintOf(week) !== intent.fingerprint) return rebalanceStaleReply()

    const blockLog = await store.loadBlockLog(accountId).catch(() => null)
    if (blockLog === null) return askUnavailableReply()

    const predictions = await store.loadPredictions(accountId).catch(() => [])
    const outcome = runRebalance(week, paramsFor(outcomesFrom(blockLog), predictions), REBALANCE_SEED)
    await store.saveWeek(accountId, outcome.schedule)

    return { text: outcome.report }
  }

  if (intent.kind === 'restAnswer') {
    if (!intent.accepted || intent.startHour === null) return discardedReply()

    const week = await store.loadWeek(accountId)

    const blockLog = await store.loadBlockLog(accountId).catch(() => null)
    if (blockLog === null) return restUnavailableReply()

    // Re-derived rather than carried in the button: the prescription is deterministic for a
    // given week and what has been confirmed, and a button carrying its own payload could
    // be replayed with a different one.
    const today = todayFor(week, now)
    const prescription = prescribe(stampSoftDeadlines(week, today, blockLog), today, blockLog)
    if (prescription === null) return noGapReply()

    // Through the app's own door, not a hand-built copy of what it makes. `restNow.ts` calls
    // `scheduleRecovery` "the only door to protected rest" and this was the exception that
    // made that untrue -- every field agreeing by luck, with §5.1's guarantee resting on the
    // two staying in step by hand. It took a `stamp` parameter to become usable from here,
    // because it read the clock and this function takes its clock as an argument.
    //
    // It is also what makes a retried tap safe: Telegram delivers a callback at least once,
    // this branch had no guard where its three siblings each have one, and `scheduleRecovery`
    // now returns the week unchanged when protected rest already sits at that day and hour.
    await store.saveWeek(
      accountId,
      scheduleRecovery(
        week,
        {
          title: prescription.title,
          type: prescription.type,
          kind: prescription.kind,
          hours: prescription.hours,
          dayIndex: prescription.dayIndex,
          startHour: prescription.startHour,
        },
        now,
      ),
    )

    return restBookedReply()
  }

  if (intent.kind === 'photo') {
    // The app's own limit, enforced before the model is called so an oversized image cannot
    // cost a request. §1.4 is the same rule in the app.
    if (intent.bytes > MAX_IMAGE_BYTES) return photoTooBigReply()

    // Unlike the planner, reading an image genuinely needs the model -- there is no rule
    // that reads a timetable. §1.4 says so plainly rather than pretending otherwise.
    if (!services.readPhotoFile) return photoUnavailableReply()

    // The anchor, derived exactly as the voice and text branches derive theirs.
    const items = await services
      .readPhotoFile(intent.fileId, await calendarOf(store, accountId, now))
      .catch(() => null)
    if (items === null) return photoUnreadableReply()

    return offerParse(store, accountId, items)
  }

  if (intent.kind === 'voice') {
    // Refused before transcription, so a long recording cannot cost a request.
    if (tooLongToTranscribe(intent.seconds)) return voiceTooLongReply()

    if (!services.transcribe) return transcriptionUnavailableReply()

    const text = await services.transcribe(intent.fileId).catch(() => null)
    if (text === null) return transcriptionUnavailableReply()

    // From here it is the ordinary brain dump, with the same limits: voice is a way of
    // typing, not a second kind of input.
    if (text.trim() === '') return nothingUnderstoodReply()
    if (text.length > MAX_INPUT_LENGTH) return tooLongReply()

    return offerParse(store, accountId, (await parseBrainDump(text, await calendarOf(store, accountId, now))).items)
  }

  if (intent.kind === 'plan') {
    // Refused before the model is called, so an oversized message cannot cost a request.
    if (intent.text.length > MAX_INPUT_LENGTH) return tooLongReply()

    return offerParse(
      store,
      accountId,
      (await parseBrainDump(intent.text, await calendarOf(store, accountId, now))).items,
    )
  }

  /**
   * §2.3's provisional yes, reachable from chat at last.
   *
   * The same `accept` the request box calls: it adds the block *and* records a commitment
   * with a review day, so saying yes is reversible by default and lapses on its own unless
   * the reserve can still hold it. Nothing is sent to anybody -- the student still answers
   * the other person themselves, in their own words, from one of the drafts.
   */
  /**
   * Ruling 24: the fortnight and a day, in one message that changes rather than a chat filling
   * with dead menus. Nothing is remembered between presses -- the day travels in the
   * callback, which is what makes this navigation without a session table.
   */
  if (intent.kind === 'openDay' || intent.kind === 'backToSchedule') {
    const week = await store.loadWeek(accountId)
    const blockLog = await store.loadBlockLog(accountId).catch(() => null)
    if (blockLog === null) return askUnavailableReply()

    if (intent.kind === 'backToSchedule') {
      const predictions = await store.loadPredictions(accountId).catch(() => [])

      return scheduleReply(
        scheduleView({ schedule: week, today: todayFor(week, now), blockLog, predictions }),
        { replacing: true },
      )
    }

    if (intent.dayIndex < 0 || intent.dayIndex >= week.horizonDays) {
      return needDayReply(week.horizonDays)
    }

    return blocksReply(
      'today',
      blocksOnDay(week, intent.dayIndex),
      answeredIds(blockLog),
      nowFor(week, now),
      { replacing: true },
    )
  }

  if (intent.kind === 'takeOn') {
    const stored = await store.findPending(accountId, intent.askId)
    const asked = stored?.items[0]
    if (stored === null || stored === undefined || asked === undefined) return taskNotFoundReply()

    // Marked before the write, so a double tap -- or Telegram re-sending an update it was
    // not acknowledged for -- cannot take the same thing on twice.
    if (stored.answeredAt !== null) return takenOnReply()
    await store.markAnswered(accountId, stored.id, now)

    const week = await store.loadWeek(accountId)
    await store.saveWeek(accountId, accept(week, asked, todayFor(week, now)))

    return takenOnReply()
  }

  if (intent.kind === 'energyAnswer' || intent.kind === 'sleepAnswer') {
    const week = await store.loadWeek(accountId)
    const today = todayFor(week, now)

    if (intent.kind === 'sleepAnswer') {
      // §8's sleep row, written into the week exactly as the today card writes it -- the
      // same `withSleep`, so a night reported on the phone and one reported in the app
      // reach the model identically.
      await store.saveWeek(accountId, withSleep(week, today, intent.bucket))

      /*
       * And recorded as an *answered* night, which the week cannot carry: `sleepByDay` holds
       * the figure and says nothing about whether anybody was asked, so without this the app
       * went on asking and `sleepReality` could not count it.
       *
       * Only when the week has a real date. The log is keyed by one, and the energy branch
       * below already states the reason: a record against a day index "means something
       * different tomorrow". The week write above is index-based and has always worked on an
       * unanchored week, so it is not made conditional on this -- only the dated record is.
       */
      const reportedOn = dateFor(week, today)
      if (reportedOn !== null) {
        await store.recordSleepNight(accountId, {
          isoDate: reportedOn,
          hours: SLEEP_HOURS[intent.bucket],
          answeredAt: now,
        })
      }

      return checkedInReply()
    }

    const forDate = dateFor(week, today)
    // §8.1 scores a claim about a *real date*. An unanchored week has none, so there is
    // nothing this answer could be attached to and saying so beats recording it against
    // a day index that means something different tomorrow.
    if (forDate === null) return checkInUnavailableReply()

    const predictions = await store.loadPredictions(accountId).catch(() => null)
    if (predictions === null) return checkInUnavailableReply()

    await store.savePredictions(accountId, resolvePrediction(predictions, forDate, intent.energy))

    return checkedInReply()
  }

  const pending = await store.findPending(accountId, intent.dumpId)
  // Read into a variable so the day index can be derived from the same week the items are
  // placed into. `resolveConfirmation` used to take an unused timestamp here and place from
  // day zero, which put anything confirmed after day two into days already lived.
  const weekForDump = await store.loadWeek(accountId)
  const resolution = resolveConfirmation(
    pending,
    intent.accepted,
    weekForDump,
    todayFor(weekForDump, now),
  )

  if (resolution.kind === 'applied') {
    // Marked answered before the week is written. If the write then fails the student is
    // told and can send it again, and a retry cannot double the week -- the safer way
    // round, because a missing item is visible and a doubled one is not.
    await store.markAnswered(accountId, intent.dumpId, now)
    await store.saveWeek(accountId, resolution.week)
  }

  if (resolution.kind === 'discarded') {
    await store.markAnswered(accountId, intent.dumpId, now)
  }

  return resolution.reply
}
