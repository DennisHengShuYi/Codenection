import { MAX_INPUT_LENGTH, parseBrainDump } from '../ai'
import type { Schedule } from '../optimizer'
import { resolveConfirmation, summarise, type PendingDump } from './brainDump'
import { linkedReply, notLinkedReply, tooLongReply, unhandledReply, type Reply } from './send'
import type { Intent } from './update'

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
