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

describe('readUpdate, the rest of the flows', () => {
  it('reads a command, with its argument', () => {
    const intent = readUpdate({ message: { chat, text: '/stuck the essay' } })

    expect(intent).toEqual({
      kind: 'command',
      chatId: 4242,
      name: 'stuck',
      argument: 'the essay',
    })
  })

  it.each(['today', 'yesterday', 'rest', 'ask', 'help'])('reads /%s', (name) => {
    const intent = readUpdate({ message: { chat, text: `/${name}` } })

    expect(intent.kind === 'command' && intent.name).toBe(name)
  })

  // Answered with help rather than guessed at or ignored.
  it('turns an unknown command into help', () => {
    const intent = readUpdate({ message: { chat, text: '/dance' } })

    expect(intent).toEqual({ kind: 'command', chatId: 4242, name: 'help', argument: '' })
  })

  // Telegram sends several sizes of the same photo. A thumbnail would read badly, so the
  // largest is the one to send to the model.
  it('reads a photo, taking the largest size offered', () => {
    const intent = readUpdate({
      message: {
        chat,
        photo: [
          { file_id: 'small', file_size: 900 },
          { file_id: 'large', file_size: 90_000 },
          { file_id: 'medium', file_size: 9_000 },
        ],
      },
    })

    expect(intent).toEqual({ kind: 'photo', chatId: 4242, fileId: 'large', bytes: 90_000 })
  })

  it('reads a voice note, with how long it is', () => {
    const intent = readUpdate({
      message: { chat, voice: { file_id: 'v1', duration: 12, file_size: 4_000 } },
    })

    expect(intent).toEqual({ kind: 'voice', chatId: 4242, fileId: 'v1', seconds: 12, bytes: 4_000 })
  })

  // A recording sent as a file rather than held-to-talk is the same thing to a student.
  it('treats an audio file like a voice note', () => {
    const intent = readUpdate({
      message: { chat, audio: { file_id: 'a1', duration: 30, file_size: 9_000 } },
    })

    expect(intent.kind).toBe('voice')
  })

  it('survives a photo array that is empty or malformed', () => {
    expect(readUpdate({ message: { chat, photo: [] } }).kind).toBe('unhandled')
    expect(readUpdate({ message: { chat, photo: 'nope' } }).kind).toBe('unhandled')
    expect(() => readUpdate({ message: { chat, voice: 'nope' } })).not.toThrow()
  })

  // A caption on a photo must not be read as a brain dump instead of the photo.
  it('reads a captioned photo as a photo', () => {
    const intent = readUpdate({
      message: { chat, photo: [{ file_id: 'p', file_size: 10 }], caption: 'my timetable' },
    })

    expect(intent.kind).toBe('photo')
  })
})

describe('readUpdate, answering a block or a prescription', () => {
  it('reads a block answer', () => {
    const intent = readUpdate({
      callback_query: { message: { chat }, data: 'block:b1:partly' },
    })

    expect(intent).toEqual({ kind: 'blockAnswer', chatId: 4242, blockId: 'b1', answer: 'partly' })
  })

  it.each(['yes', 'no', 'partly'])('reads a %s answer', (answer) => {
    const intent = readUpdate({
      callback_query: { message: { chat }, data: `block:b1:${answer}` },
    })

    expect(intent.kind === 'blockAnswer' && intent.answer).toBe(answer)
  })

  it('ignores an answer that is not one of the three', () => {
    expect(
      readUpdate({ callback_query: { message: { chat }, data: 'block:b1:maybe' } }).kind,
    ).toBe('unhandled')
  })

  it('reads accepting a rest block', () => {
    const intent = readUpdate({
      callback_query: { message: { chat }, data: 'rest:accept:15' },
    })

    expect(intent).toEqual({ kind: 'restAnswer', chatId: 4242, startHour: 15, accepted: true })
  })

  it('reads declining one', () => {
    const intent = readUpdate({ callback_query: { message: { chat }, data: 'rest:decline' } })

    expect(intent).toEqual({ kind: 'restAnswer', chatId: 4242, startHour: null, accepted: false })
  })

  it('ignores a rest acceptance with an unreadable hour', () => {
    expect(
      readUpdate({ callback_query: { message: { chat }, data: 'rest:accept:teatime' } }).kind,
    ).toBe('unhandled')
  })
})
