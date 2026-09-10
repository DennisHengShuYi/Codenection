import type { BlockAnswer } from '../domain/blockLog'
import type { SleepBucket } from '../ui/today/checkIn'
import type { LoadType } from '../engine'
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
  | {
      kind: 'blockAnswer'
      chatId: number
      blockId: string
      type: LoadType
      plannedHours: number
      dayIndex: number
      answer: BlockAnswer
    }
  | { kind: 'restAnswer'; chatId: number; startHour: number | null; accepted: boolean }
  | { kind: 'takeOn'; chatId: number; askId: string }
  | { kind: 'openDay'; chatId: number; dayIndex: number }
  | { kind: 'backToSchedule'; chatId: number }
  | { kind: 'energyAnswer'; chatId: number; energy: number }
  | { kind: 'sleepAnswer'; chatId: number; bucket: SleepBucket }
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

/**
 * §8b②'s callback payload, decoded.
 *
 * The bot has the week in hand when it builds the buttons in `send.ts`, and this callback is
 * the only place that information survives the round trip -- so it carries the block's type
 * and planned hours back alongside the answer, not just the id. Both are encoded as a single
 * character rather than the word itself, because a long block id plus four readable words
 * would risk Telegram's 64-byte limit on `callback_data`; the block id is the part with no
 * fixed length, so everything else is kept as small as it can honestly be.
 *
 * This is untrusted input -- anyone can post to the webhook -- so both maps are total over
 * exactly the characters the regex admits, and nothing here is trusted before it is looked up.
 */
const TYPE_BY_CODE: Record<string, LoadType> = {
  m: 'mental',
  p: 'physical',
  s: 'social',
  e: 'errands',
}

/** §8b②'s four-way answer, replacing yes/no/partly. Order is arbitrary; what matters is that
 *  it matches the codes `send.ts` writes into a button's `data`. */
const ANSWER_BY_CODE: Record<string, BlockAnswer> = {
  '0': 'didnt',
  '1': 'less',
  '2': 'right',
  '3': 'longer',
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

/**
 * The id a button press must be acknowledged with, or null when the update was not one.
 *
 * Telegram shows a loading indicator on a tapped button and clears it only when the bot
 * answers that specific callback query. Nothing ever did, so every button press in the app
 * span until the client timed out -- the only signal a student got that their answer had
 * landed was the spinner eventually giving up.
 *
 * Separate from `readUpdate` rather than a field on `Intent`: acknowledging is owed for
 * *every* press, including the ones that read as `unhandled`, so tying it to a successfully
 * parsed intent would leave exactly the presses that already went wrong still spinning.
 *
 * Validated rather than trusted, like everything else here -- anyone can post to the
 * webhook, and this value is interpolated into an outbound API call.
 */
export function callbackIdOf(update: unknown): string | null {
  if (!isObject(update) || !isObject(update.callback_query)) return null

  const id = update.callback_query.id
  return typeof id === 'string' ? id : null
}

/**
 * The message a button press came from, so the reply can replace it in place.
 *
 * §24: Telegram allows a message's text and keyboard to be swapped, which turns `/schedule`
 * into navigation -- tap day 3, the same message becomes the day view, tap back and it
 * returns -- without a session table anywhere, and without filling the chat log with dead
 * menus nobody can act on any more.
 *
 * Beside `readUpdate` rather than inside it, for the same reason `callbackIdOf` is: this is
 * a fact about the transport, not about what the student meant, and every intent that comes
 * from a press can use it including the ones that read as `unhandled`.
 *
 * Validated rather than trusted -- anyone can post to the webhook and this is interpolated
 * into an outbound API call.
 */
export function messageIdOf(update: unknown): number | null {
  if (!isObject(update) || !isObject(update.callback_query)) return null
  if (!isObject(update.callback_query.message)) return null

  const id = update.callback_query.message.message_id

  return typeof id === 'number' ? id : null
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

    // §8b②'s shape: id, type code, planned hours, day index, answer code. The character
    // classes are the validation -- anything outside them cannot reach `TYPE_BY_CODE` or
    // `ANSWER_BY_CODE`, so a lookup here can never miss.
    const block = /^block:(.+):([mpse]):(\d+(?:\.\d+)?):(\d+):([0-3])$/.exec(data)
    if (block !== null) {
      return {
        kind: 'blockAnswer',
        chatId,
        blockId: block[1] as string,
        type: TYPE_BY_CODE[block[2] as string] as LoadType,
        plannedHours: Number(block[3]),
        dayIndex: Number(block[4]),
        answer: ANSWER_BY_CODE[block[5] as string] as BlockAnswer,
      }
    }

    // §24's navigation. The day index travels in the callback, so moving between the
    // fortnight and a day needs nothing remembered between one message and the next.
    const open = /^open:(\d{1,2})$/.exec(data)
    if (open !== null) {
      return { kind: 'openDay', chatId, dayIndex: Number(open[1]) }
    }

    if (data === 'back:schedule') {
      return { kind: 'backToSchedule', chatId }
    }

    // §2.3's provisional yes: writes to the student's own week, sends nothing to anybody.
    const takeOn = /^takeon:(.+)$/.exec(data)
    if (takeOn !== null) {
      return { kind: 'takeOn', chatId, askId: takeOn[1] as string }
    }

    // §8's check-in, answered in one tap. Everything the answer needs travels in the
    // callback, so nothing has to be remembered between one message and the next.
    const energy = /^energy:(\d{1,3})$/.exec(data)
    if (energy !== null) {
      return { kind: 'energyAnswer', chatId, energy: Number(energy[1]) }
    }

    const sleep = /^sleep:(under5|six|seven|eightPlus)$/.exec(data)
    if (sleep !== null) {
      return { kind: 'sleepAnswer', chatId, bucket: sleep[1] as SleepBucket }
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
