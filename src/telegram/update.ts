import { readStartCode } from './linkCode'

/**
 * What a student asked for, read out of whatever Telegram posted.
 *
 * Every payload maps to exactly one of these, `unhandled` included. That matters more here
 * than in most parsing: this address is public, anyone can post anything to it, and a shape
 * we did not anticipate must produce an intent rather than an exception.
 */
export type Intent =
  | { kind: 'link'; chatId: number; code: string }
  | { kind: 'plan'; chatId: number; text: string }
  | { kind: 'confirm'; chatId: number; dumpId: string; accepted: boolean }
  | { kind: 'unhandled'; chatId: number | null }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/**
 * The chat id, and only from the chat.
 *
 * Never from anything the student typed: reading it out of the message body would let
 * somebody name a chat that is not theirs and have the bot act on that account.
 */
function chatIdOf(container: unknown): number | null {
  if (!isObject(container)) return null

  const chat = container.chat
  if (!isObject(chat)) return null

  return typeof chat.id === 'number' ? chat.id : null
}

const textOf = (message: Record<string, unknown>): string =>
  typeof message.text === 'string' ? message.text : ''

export function readUpdate(update: unknown): Intent {
  if (!isObject(update)) return { kind: 'unhandled', chatId: null }

  // A button press on a confirmation. Checked first because such an update carries a
  // message too, and the press is what the student actually did.
  if (isObject(update.callback_query)) {
    const query = update.callback_query
    const chatId = chatIdOf(query.message)
    const data = typeof query.data === 'string' ? query.data : ''

    const match = /^(confirm|discard):(.+)$/.exec(data)
    if (chatId === null || match === null) return { kind: 'unhandled', chatId }

    return {
      kind: 'confirm',
      chatId,
      dumpId: match[2] as string,
      accepted: match[1] === 'confirm',
    }
  }

  // `edited_message` is deliberately not read. Telegram resends the whole message when a
  // student fixes a typo, and treating that as new would plan the same week twice.
  if (!isObject(update.message)) return { kind: 'unhandled', chatId: null }

  const message = update.message
  const chatId = chatIdOf(message)
  if (chatId === null) return { kind: 'unhandled', chatId: null }

  const text = textOf(message)

  const code = readStartCode(text)
  if (code !== null) return { kind: 'link', chatId, code }

  // A sticker, a photo, or a voice note arrives with no text. Voice is specced for later
  // (§13.7) and must not be silently treated as an empty brain dump before then.
  if (text.trim() === '') return { kind: 'unhandled', chatId }

  return { kind: 'plan', chatId, text }
}
