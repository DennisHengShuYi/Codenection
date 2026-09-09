import { describe, expect, it } from 'vitest'
import { readUpdate } from './update'

const chat = { id: 4242 }

describe('readUpdate', () => {
  it('reads a link request out of a start command', () => {
    const intent = readUpdate({ message: { chat, text: '/start ABC23456' } })

    expect(intent).toEqual({ kind: 'link', chatId: 4242, code: 'ABC23456' })
  })

  it('reads an ordinary message as something to plan', () => {
    const intent = readUpdate({ message: { chat, text: 'essay due friday, gym, laundry' } })

    expect(intent).toEqual({
      kind: 'plan',
      chatId: 4242,
      text: 'essay due friday, gym, laundry',
    })
  })

  it('reads a button press as an answer to a confirmation', () => {
    const intent = readUpdate({
      callback_query: { message: { chat }, data: 'confirm:dump-1' },
    })

    expect(intent).toEqual({ kind: 'confirm', chatId: 4242, dumpId: 'dump-1', accepted: true })
  })

  it('reads the other button as a refusal', () => {
    const intent = readUpdate({
      callback_query: { message: { chat }, data: 'discard:dump-1' },
    })

    expect(intent).toEqual({ kind: 'confirm', chatId: 4242, dumpId: 'dump-1', accepted: false })
  })

  // A sticker, a photo, or a voice note. Voice is specced for later (§13.7) and must not be
  // silently treated as an empty brain dump in the meantime.
  it('does not treat a message with no text as an empty plan', () => {
    const intent = readUpdate({ message: { chat } })

    expect(intent.kind).toBe('unhandled')
  })

  it('does not treat blank text as a plan either', () => {
    const intent = readUpdate({ message: { chat, text: '   ' } })

    expect(intent.kind).toBe('unhandled')
  })

  /**
   * Correcting a typo must not plan the week a second time. Telegram sends the whole message
   * again under a different key when it is edited, which would otherwise read as a new one.
   */
  it('ignores an edited message', () => {
    const intent = readUpdate({ edited_message: { chat, text: 'essay due friday' } })

    expect(intent.kind).toBe('unhandled')
  })

  it('ignores an update with nothing in it', () => {
    expect(readUpdate({}).kind).toBe('unhandled')
  })

  // Anyone on the internet can post to this address, so malformed input is expected rather
  // than exceptional. None of these may throw.
  it('survives payloads that are the wrong shape entirely', () => {
    expect(() => readUpdate(null)).not.toThrow()
    expect(() => readUpdate('not an object')).not.toThrow()
    expect(() => readUpdate({ message: 'not an object' })).not.toThrow()
    expect(() => readUpdate({ message: { chat: null, text: 'hello' } })).not.toThrow()
    expect(() => readUpdate({ message: { chat: { id: 'not a number' }, text: 'x' } })).not.toThrow()

    expect(readUpdate(null).kind).toBe('unhandled')
    expect(readUpdate({ message: { chat: { id: 'not a number' }, text: 'x' } }).kind).toBe(
      'unhandled',
    )
  })

  it('treats an unrecognised button as unhandled rather than confirming something', () => {
    expect(readUpdate({ callback_query: { message: { chat }, data: 'nonsense' } }).kind).toBe(
      'unhandled',
    )
  })

  /**
   * The chat id is read from the chat, never from anything the student typed. Reading it out
   * of the body would let somebody name a chat that is not theirs and act on that account.
   */
  it('takes the chat id from the chat and not from the text', () => {
    const intent = readUpdate({ message: { chat: { id: 7 }, text: 'chat id 9999' } })

    expect(intent.kind === 'plan' && intent.chatId).toBe(7)
  })
})
