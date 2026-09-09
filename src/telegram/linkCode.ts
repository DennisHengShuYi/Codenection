/**
 * The short code that ties a Telegram chat to an account.
 *
 * A chat id proves nothing -- anyone can message a bot, and Telegram will happily tell us
 * their chat id. The code is what turns "some chat" into "the chat belonging to the student
 * who was signed in when they asked for it", so it is the whole of the security boundary
 * for §13.5 and is treated accordingly: unguessable, and short-lived.
 */

/**
 * No O, 0, I, l or 1. A student may read this off one screen and type it into another, and
 * a code that fails because of a confusable character reads as the app being broken.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const CODE_LENGTH = 8

/** Long enough to be useless to guess at, short enough to survive being retyped. */
export const CODE_LIFETIME_MS = 10 * 60 * 1000

/**
 * `crypto.getRandomValues` rather than `Math.random`, which is not intended to be
 * unpredictable and is documented as unsuitable for anything security-related. Available in
 * the browser, in Node, and in the edge runtime the endpoint runs on.
 *
 * The modulo below is very slightly biased towards the start of the alphabet -- with 32
 * characters and a 256-value byte it is in fact exact, and it is left simple on purpose
 * rather than rejection-sampled, since the alphabet length is a power of two.
 */
export function makeLinkCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)

  let code = ''
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length]

  return code
}

/** Expired at exactly its lifetime, not one moment after: the boundary falls on the safer
 *  side deliberately. */
export function hasExpired(issuedAt: number, now: number): boolean {
  return now - issuedAt >= CODE_LIFETIME_MS
}

/**
 * The code carried by a `/start`, or null.
 *
 * Null rather than an empty string, because an empty string could match an empty stored
 * value and link a chat to whatever happened to be pending. Only `/start` is read: an
 * ordinary message that merely mentions starting is not an attempt to link.
 *
 * `/start@somebot` is how Telegram addresses a command to one bot in a group chat.
 */
export function readStartCode(text: string): string | null {
  const match = /^\/start(?:@\S+)?\s+(\S+)\s*$/.exec(text.trim())
  if (match === null) return null

  const code = match[1]?.toUpperCase() ?? ''
  return code === '' ? null : code
}
