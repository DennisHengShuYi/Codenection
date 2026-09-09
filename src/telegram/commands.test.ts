import { describe, expect, it } from 'vitest'
import { readCommand } from './commands'

describe('readCommand', () => {
  it.each(['today', 'yesterday', 'rest', 'stuck', 'ask', 'help'])('recognises /%s', (name) => {
    expect(readCommand(`/${name}`)).toEqual({ name, argument: '' })
  })

  it('reads the argument after a command', () => {
    expect(readCommand('/stuck the essay')).toEqual({ name: 'stuck', argument: 'the essay' })
  })

  // An empty argument is an ordinary case, not a failure: /today never has one.
  it('reports an empty argument rather than failing', () => {
    expect(readCommand('/today')).toEqual({ name: 'today', argument: '' })
  })

  // Telegram addresses commands to a named bot in group chats.
  it('recognises a command addressed to the bot by name', () => {
    expect(readCommand('/stuck@codenection_bot essay')).toEqual({
      name: 'stuck',
      argument: 'essay',
    })
  })

  // Phone keyboards capitalise the first letter, and a student should not have to fight it.
  it('recognises a command typed in the wrong case', () => {
    expect(readCommand('/Today')).toEqual({ name: 'today', argument: '' })
  })

  it('ignores whitespace around the message', () => {
    expect(readCommand('  /rest  ')).toEqual({ name: 'rest', argument: '' })
  })

  it('keeps the argument as written, including its inner spacing', () => {
    expect(readCommand('/ask can you cover my shift  saturday')).toEqual({
      name: 'ask',
      argument: 'can you cover my shift  saturday',
    })
  })

  // Answered with help rather than guessed at: guessing which command somebody meant is
  // how a bot does the wrong thing confidently.
  it('does not recognise an unknown command', () => {
    expect(readCommand('/dance')).toBeNull()
  })

  /**
   * The commonest thing a student sends is a brain dump, and it must stay free of ceremony.
   * Only a message that begins with a slash is ever a command.
   */
  it('does not treat a plain message as a command', () => {
    expect(readCommand('essay due friday, gym, laundry')).toBeNull()
  })

  it('does not treat a slash mid-sentence as a command', () => {
    expect(readCommand('finish the report and/or the essay')).toBeNull()
  })

  // /start belongs to linking, and readStartCode handles it. It must not be swallowed here
  // as an unknown command, which would answer it with help instead of linking the chat.
  it('leaves /start alone', () => {
    expect(readCommand('/start ABC23456')).toBeNull()
  })

  it('finds nothing in an empty message', () => {
    expect(readCommand('')).toBeNull()
  })
})
