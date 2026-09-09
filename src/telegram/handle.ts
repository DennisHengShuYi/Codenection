import { MAX_IMAGE_BYTES, MAX_INPUT_LENGTH, parseBrainDump, type ParsedItem } from '../ai'
import { todayIndex } from '../domain/calendar'
import { blocksOnDay } from '../domain/dayBlocks'
import { firstAction } from '../domain/microStart'
import { prescribe } from '../domain/prescribe'
import type { Schedule } from '../optimizer'
import { tooLongToTranscribe } from './audio'
import { resolveConfirmation, summarise, type PendingDump } from './brainDump'
import {
  askReply,
  askUnavailableReply,
  askUnreadableReply,
  blockAnsweredReply,
  blocksReply,
  discardedReply,
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
  readonly priceAsk?: (
    text: string,
    week: Schedule,
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
  /** §7.9's evidence. Recorded, never acted on: Reality Check (§2.4) and the carryover
   *  matrix (§6.6) will read this, and neither exists yet. */
  recordBlockAnswer(
    accountId: string,
    blockId: string,
    answer: 'yes' | 'no' | 'partly',
    now: number,
  ): Promise<void>
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

  if (intent.kind === 'command') {
    switch (intent.name) {
      case 'help':
        return helpReply()

      case 'today': {
        const week = await store.loadWeek(accountId)
        return blocksReply('today', blocksOnDay(week, todayFor(week, now)))
      }

      case 'yesterday': {
        const week = await store.loadWeek(accountId)
        const today = todayIndex(week, new Date(now))

        // Unanchored, or the week began today: either way there is no yesterday inside it,
        // and answering with some other day would put wrong data into the table §2.4 will
        // later trust.
        if (today === null || today < 1) return yesterdayUnavailableReply()

        return blocksReply('yesterday', blocksOnDay(week, today - 1))
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
        const priced = await services.priceAsk(intent.argument, week).catch(() => null)

        // Nothing is ever written here. §2.3 prices a request; agreeing to it is a separate
        // act the student takes in their own words, in their own messaging app.
        return priced === null ? askUnreadableReply() : askReply(priced.cost, priced.drafts)
      }
    }
  }

  if (intent.kind === 'blockAnswer') {
    await store.recordBlockAnswer(accountId, intent.blockId, intent.answer, now)

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
