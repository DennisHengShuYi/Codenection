import { readCommand, type CommandName } from './commands'
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
  // One intent carrying the command name rather than one intent per command. The
  // dispatcher switches on the name either way, and six near-identical shapes would be six
  // places to keep in step for no gain.
  | { kind: 'command'; chatId: number; name: CommandName; argument: string }
  | { kind: 'blockAnswer'; chatId: number; blockId: string; answer: 'yes' | 'no' | 'partly' }
  | { kind: 'restAnswer'; chatId: number; startHour: number | null; accepted: boolean }
  | { kind: 'photo'; chatId: number; fileId: string; bytes: number }
  | { kind: 'voice'; chatId: number; fileId: string; seconds: number; bytes: number }
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

/**
 * The largest of the sizes Telegram offers for one photo.
 *
 * It sends several. A thumbnail is cheaper to fetch and useless to read a timetable from,
 * so the biggest is always the right one here.
 */
function largestPhoto(value: unknown): { fileId: string; bytes: number } | null {
  if (!Array.isArray(value)) return null

  let best: { fileId: string; bytes: number } | null = null

  for (const size of value) {
    if (!isObject(size)) continue
    if (typeof size.file_id !== 'string') continue

    const bytes = typeof size.file_size === 'number' ? size.file_size : 0
    if (best === null || bytes > best.bytes) best = { fileId: size.file_id, bytes }
  }

  return best
}

/** A held-to-talk voice note and an audio file are the same thing to a student. */
function audioIn(
  message: Record<string, unknown>,
): { fileId: string; seconds: number; bytes: number } | null {
  const source = isObject(message.voice) ? message.voice : isObject(message.audio) ? message.audio : null
  if (source === null || typeof source.file_id !== 'string') return null

  return {
    fileId: source.file_id,
    seconds: typeof source.duration === 'number' ? source.duration : 0,
    bytes: typeof source.file_size === 'number' ? source.file_size : 0,
  }
}

export function readUpdate(update: unknown): Intent {
  if (!isObject(update)) return { kind: 'unhandled', chatId: null }

  // A button press on a confirmation. Checked first because such an update carries a
  // message too, and the press is what the student actually did.
  if (isObject(update.callback_query)) {
    const query = update.callback_query
    const chatId = chatIdOf(query.message)
    const data = typeof query.data === 'string' ? query.data : ''

    if (chatId === null) return { kind: 'unhandled', chatId }

    const dump = /^(confirm|discard):(.+)$/.exec(data)
    if (dump !== null) {
      return { kind: 'confirm', chatId, dumpId: dump[2] as string, accepted: dump[1] === 'confirm' }
    }

    // Only the three answers §7.9 names. Anything else is a button we did not send.
    const block = /^block:(.+):(yes|no|partly)$/.exec(data)
    if (block !== null) {
      return {
        kind: 'blockAnswer',
        chatId,
        blockId: block[1] as string,
        answer: block[2] as 'yes' | 'no' | 'partly',
      }
    }

    if (data === 'rest:decline') {
      return { kind: 'restAnswer', chatId, startHour: null, accepted: false }
    }

    const rest = /^rest:accept:(\d+(?:\.\d+)?)$/.exec(data)
    if (rest !== null) {
      return { kind: 'restAnswer', chatId, startHour: Number(rest[1]), accepted: true }
    }

    return { kind: 'unhandled', chatId }
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

  // Checked before the caption is read: a photo with "my timetable" written under it is a
  // photo, not a brain dump about a timetable.
  const photo = largestPhoto(message.photo)
  if (photo !== null) return { kind: 'photo', chatId, ...photo }

  const audio = audioIn(message)
  if (audio !== null) return { kind: 'voice', chatId, ...audio }

  if (text.trimStart().startsWith('/')) {
    // An unrecognised command becomes help rather than silence or a guess.
    const command = readCommand(text) ?? { name: 'help' as CommandName, argument: '' }
    return { kind: 'command', chatId, name: command.name, argument: command.argument }
  }

  // A sticker, a photo, or a voice note arrives with no text. Voice is specced for later
  // (§13.7) and must not be silently treated as an empty brain dump before then.
  if (text.trim() === '') return { kind: 'unhandled', chatId }

  return { kind: 'plan', chatId, text }
}
