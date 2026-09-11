import { MAX_ITEMS, type ParsedItem, type ParseOutcome } from '../ai'
import { addItems } from '../domain/addItems'
import type { Schedule } from '../optimizer'
import {
  appliedReply,
  confirmationReply,
  discardedReply,
  nothingUnderstoodReply,
  unhandledReply,
  type Reply,
} from './render'

/**
 * A parse waiting to be confirmed.
 *
 * Held between the message that produced it and the button that answers it, because §3.2
 * applies here exactly as it does in the app: parsed items are proposals until the student
 * approves them, and a chat interface makes silent commitment easier rather than harder.
 */
export interface PendingDump {
  readonly id: string
  readonly items: readonly ParsedItem[]
  /** When it was answered, or null while it is still open. */
  readonly answeredAt: number | null
}

export type Resolution =
  | { kind: 'applied'; week: Schedule; reply: Reply }
  | { kind: 'discarded'; reply: Reply }
  | { kind: 'already'; reply: Reply }
  | { kind: 'unknown'; reply: Reply }

/**
 * What the bot says about a parse, before anything is written.
 *
 * Capped at the same number of items the app allows: arriving through Telegram must not be
 * a way around a limit §3.1 enforces everywhere else.
 *
 * The source of the parse -- the model or the rule-based fallback -- is deliberately not
 * mentioned. The app does not tell a student which one answered either, and it is not a
 * distinction they can act on.
 */
export function summarise(dumpId: string, outcome: ParseOutcome): Reply {
  const items = outcome.items.slice(0, MAX_ITEMS)

  return items.length === 0 ? nothingUnderstoodReply() : confirmationReply(dumpId, items)
}

/**
 * Applies an answer to a pending dump, or explains why it cannot.
 *
 * `answeredAt` is what makes a repeat harmless. Telegram re-sends an update it was not
 * acknowledged for, and a student can press a button twice; without this, either would add
 * the same items to the week again.
 */
export function resolveConfirmation(
  pending: PendingDump | null,
  accepted: boolean,
  week: Schedule,
  /**
   * Which day of the fortnight the student is on, for `addItems` to place from.
   *
   * This slot held an unused `_now` timestamp. `addItems` hardcoded day zero, so a dump
   * confirmed on day ten landed on day two -- work scheduled into days already lived, which
   * is the one thing a chat channel must not be able to do that the app cannot (§13.4). A
   * timestamp was the wrong shape for the question: the caller has `todayFor` and the answer
   * is a day index.
   */
  today: number,
): Resolution {
  // A button from a dump we have no record of. Refused rather than applied to whatever is
  // current: a stale button must not reach into a week it was never shown.
  if (pending === null) return { kind: 'unknown', reply: unhandledReply() }

  if (pending.answeredAt !== null) return { kind: 'already', reply: discardedReply() }

  if (!accepted) return { kind: 'discarded', reply: discardedReply() }

  // addItems is the app's own path from parsed items to a week, so the chat cannot produce
  // a week the app could not have produced itself.
  return {
    kind: 'applied',
    week: addItems(week, pending.items, today),
    reply: appliedReply(pending.items.length),
  }
}
