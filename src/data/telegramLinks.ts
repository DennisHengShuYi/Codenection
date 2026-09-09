import { getClient } from './auth'
import { readDataConfig } from './env'
import { makeLinkCode } from '../telegram/linkCode'

/**
 * The app's half of linking a Telegram chat (§13.5).
 *
 * Everything here goes through the ordinary signed-in client, so row-level security still
 * applies to every call the browser makes. The database functions behind these are
 * `security definer` and keyed on `auth.uid()` rather than on anything passed in, which is
 * what stops a caller minting a code that links a chat to somebody else's account.
 *
 * The service-role key that the bot uses appears nowhere in this file, or anywhere else
 * under `src/`.
 */
export type LinkOffer =
  | { readonly ok: true; readonly code: string; readonly url: string }
  | { readonly ok: false; readonly message: string }

const CANNOT_REACH = 'Could not reach the server. Check your connection and try again.'

/**
 * Issues a code and returns it with the link that carries it.
 *
 * The code is generated here and sent to the database rather than the other way round: it
 * has to reach the student either way, and this keeps the database function to a single
 * insert with nothing to return.
 */
export async function requestLinkCode(): Promise<LinkOffer> {
  const { telegramBot } = readDataConfig()

  if (telegramBot === null) {
    return { ok: false, message: 'Telegram is not set up for this build.' }
  }

  const code = makeLinkCode()

  try {
    const client = await getClient()
    const { error } = await client.rpc('issue_telegram_link_code', { new_code: code })

    if (error) return { ok: false, message: CANNOT_REACH }

    // Tapping this is the whole point: nobody should have to retype a code onto a phone.
    return { ok: true, code, url: `https://t.me/${telegramBot}?start=${code}` }
  } catch {
    return { ok: false, message: CANNOT_REACH }
  }
}

/** Unlinking something that is not linked is a success: the desired state already holds,
 *  and a student should not be told off for asking for it. */
export async function unlinkTelegram(): Promise<{ ok: boolean; message?: string }> {
  try {
    const client = await getClient()
    const { error } = await client.rpc('unlink_telegram')

    return error ? { ok: false, message: CANNOT_REACH } : { ok: true }
  } catch {
    return { ok: false, message: CANNOT_REACH }
  }
}

/**
 * Whether this account has a chat linked.
 *
 * Answers false rather than throwing when it cannot tell. Claiming a link that may not
 * exist would show a student an unlink button for nothing; claiming none is both honest
 * and recoverable, since they can simply link again.
 */
export async function hasTelegramLink(): Promise<boolean> {
  try {
    const client = await getClient()
    const { data, error } = await client.rpc('has_telegram_link')

    return error ? false : data === true
  } catch {
    return false
  }
}
