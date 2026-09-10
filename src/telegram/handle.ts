import { MAX_IMAGE_BYTES, MAX_INPUT_LENGTH, parseBrainDump, type ParsedItem } from '../ai'
import { todayIndex } from '../domain/calendar'
import { blocksOnDay } from '../domain/dayBlocks'
import { answeredIds, checkedInDays, outcomesFrom, type BlockAnswer, type BlockRecord } from '../domain/blockLog'
import type { BlockOutcome } from '../domain/calibration'
import { lapsed } from '../domain/commitments'
import { paramsFor } from '../domain/engineParams'
import type { EnergyPrediction } from '../domain/predictions'
import { accuracyLine } from '../domain/predictions'
import { biasLine } from '../domain/realityCheck'
import { runRebalance } from '../domain/rebalanceOutcome'
import { firstAction } from '../domain/microStart'
import { prescribe } from '../domain/prescribe'
import { overallReserve, project, type LoadType } from '../engine'
import { toDayInputs, type Schedule } from '../optimizer'
import { tooLongToTranscribe } from './audio'
import { resolveConfirmation, summarise, type PendingDump } from './brainDump'
import {
  askReply,
  askUnavailableReply,
  askUnreadableReply,
  blockAnsweredReply,
  blocksReply,
  discardedReply,
  lapsedReply,
  needDayReply,
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
} from './send'
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
  /** Fetches the image from Telegram and runs the app's own reader over it. Null when it
   *  could not be read at all. */
  readonly readPhotoFile?: (fileId: string) => Promise<readonly ParsedItem[] | null>
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
        return blocksReply('today', blocksOnDay(week, todayFor(week, now)), await answeredSoFar(week))
      }

      case 'yesterday': {
        const week = await store.loadWeek(accountId)
        const today = todayIndex(week, new Date(now))

        // Unanchored, or the week began today: either way there is no yesterday inside it,
        // and answering with some other day would put wrong data into the table §2.4 will
        // later trust.
        if (today === null || today < 1) return yesterdayUnavailableReply()

        return blocksReply('yesterday', blocksOnDay(week, today - 1), await answeredSoFar(week))
      }

      /**
       * §22: the state of the fortnight, which chat could not see at all.
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
          firstDeficitDay: projection.firstDeficitDay,
          accuracy: accuracyLine(predictions),
          bias: bestMeasuredBias(outcomes),
        })
      }

      /** §22: any day of the fortnight, not only today and yesterday. */
      case 'day': {
        const asked = Number.parseInt(intent.argument, 10)
        const week = await store.loadWeek(accountId)

        // Refused rather than clamped. A student who typed 40 and got day 20 would be
        // reading a day they did not ask for and had no way to know they were reading.
        if (!Number.isInteger(asked) || asked < 0 || asked >= week.horizonDays) {
          return needDayReply(week.horizonDays)
        }

        return blocksReply('today', blocksOnDay(week, asked), await answeredSoFar(week))
      }

      /**
       * §22: the same rebalance the week screen runs, through `runRebalance` -- which now
       * lives in `src/domain` for exactly this reason. Two rearranging algorithms with
       * different logic would disagree, and the one that ran last would win.
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
        await store.saveWeek(accountId, outcome.schedule)

        return rebalanceReply(outcome.report, outcome.fallback?.move.description ?? null)
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
        const prescription = prescribe(week)

        // Null covers both "nothing is low enough to need this" and "there is no room",
        // which prescribe() deliberately does not distinguish -- either way there is one
        // honest answer and it is not a suggestion.
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

        const priced = await services
          .priceAsk(intent.argument, week, todayFor(week, now), blockLog)
          .catch(() => null)

        // Nothing is ever written here. §2.3 prices a request; agreeing to it is a separate
        // act the student takes in their own words, in their own messaging app.
        return priced === null ? askUnreadableReply() : askReply(priced.cost, priced.drafts)
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

  if (intent.kind === 'restAnswer') {
    if (!intent.accepted || intent.startHour === null) return discardedReply()

    const week = await store.loadWeek(accountId)

    // Re-derived rather than carried in the button: the prescription is deterministic for a
    // given week and reserves, and a button carrying its own payload could be replayed with
    // a different one.
    const prescription = prescribe(week)
    if (prescription === null) return noGapReply()

    await store.saveWeek(accountId, {
      ...week,
      items: [
        ...week.items,
        {
          id: `${prescription.id}-${now}`,
          title: prescription.title,
          type: prescription.type,
          kind: prescription.kind,
          hours: prescription.hours,
          intensity: 1,
          dayIndex: prescription.dayIndex,
          startHour: prescription.startHour,
          // §5.1: fixed and protected. Rest the optimizer can move to fit work in is not
          // protected at all, and this is the app's most important design decision.
          fixed: true,
          deadlineDay: null,
          protectedRest: true,
        },
      ],
    })

    return restBookedReply()
  }

  if (intent.kind === 'photo') {
    // The app's own limit, enforced before the model is called so an oversized image cannot
    // cost a request. §1.4 is the same rule in the app.
    if (intent.bytes > MAX_IMAGE_BYTES) return photoTooBigReply()

    // Unlike the planner, reading an image genuinely needs the model -- there is no rule
    // that reads a timetable. §1.4 says so plainly rather than pretending otherwise.
    if (!services.readPhotoFile) return photoUnavailableReply()

    const items = await services.readPhotoFile(intent.fileId).catch(() => null)
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

    return offerParse(store, accountId, (await parseBrainDump(text)).items)
  }

  if (intent.kind === 'plan') {
    // Refused before the model is called, so an oversized message cannot cost a request.
    if (intent.text.length > MAX_INPUT_LENGTH) return tooLongReply()

    return offerParse(store, accountId, (await parseBrainDump(intent.text)).items)
  }

  const pending = await store.findPending(accountId, intent.dumpId)
  const resolution = resolveConfirmation(pending, intent.accepted, await store.loadWeek(accountId), now)

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
