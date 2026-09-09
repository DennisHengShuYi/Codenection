import { MAX_INPUT_LENGTH, microStartFrom, microStartPrompt, parseBrainDump } from '../ai'
import { blocksOnDay } from '../domain/dayBlocks'
import { prescribeRest } from '../domain/prescribe'
import type { Schedule } from '../optimizer'
import { resolveConfirmation, summarise, type PendingDump } from './brainDump'
import {
  blocksReply,
  helpReply,
  linkedReply,
  microStartReply,
  needTaskReply,
  noGapReply,
  notLinkedReply,
  restReply,
  tooLongReply,
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
}

/** Day 0 is today. The schedule carries no date anchor, so this is the only day the model
 *  can name -- see `yesterdayUnavailableReply` for what that costs. */
const TODAY = 0

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
}

/** Distinct per dump so a button can only ever answer the parse it was attached to. */
const newDumpId = (): string => crypto.randomUUID()

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
        return blocksReply('today', blocksOnDay(week, TODAY))
      }

      // The schedule has no date anchor, so there is no yesterday to look up. Said plainly
      // rather than answered with today's blocks under yesterday's name.
      case 'yesterday':
        return yesterdayUnavailableReply()

      case 'rest': {
        const week = await store.loadWeek(accountId)
        const prescription = prescribeRest(week, week.start, TODAY)

        return prescription === null ? noGapReply() : restReply(prescription)
      }

      case 'stuck': {
        if (intent.argument === '') return needTaskReply()

        // With no model configured this still answers, from the rule. §4.1 is useless if it
        // only works when a key happens to be set.
        const reply = services.askModel
          ? await services.askModel(microStartPrompt(intent.argument)).catch(() => null)
          : null

        return microStartReply(microStartFrom(intent.argument, reply).action)
      }

      case 'ask':
        return unhandledReply()
    }
  }

  if (intent.kind === 'photo' || intent.kind === 'voice') {
    // Wired in api/telegram.ts, which is the only place that can fetch a file from Telegram.
    return unhandledReply()
  }

  if (intent.kind === 'plan') {
    // Refused before the model is called, so an oversized message cannot cost a request.
    if (intent.text.length > MAX_INPUT_LENGTH) return tooLongReply()

    const outcome = await parseBrainDump(intent.text)
    const dumpId = newDumpId()

    // Stored, not applied. §3.2: parsed items are proposals until the student approves.
    await store.savePending(accountId, { id: dumpId, items: outcome.items, answeredAt: null })

    return summarise(dumpId, outcome)
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
