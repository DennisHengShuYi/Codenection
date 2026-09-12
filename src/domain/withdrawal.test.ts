import { describe, expect, it } from 'vitest'
import { withdrawalFor } from './withdrawal'

/**
 * The words a student sends when something has to come out.
 *
 * Lifted out of `LapsedNotice` when that card was replaced, rather than deleted with it.
 * §2.3's insight survives the card that carried it: students do not struggle to say no
 * because they lack a reason, they struggle because saying no requires an act -- so the app
 * writes the sentence and leaves only the sending.
 *
 * A template rather than a model call, and that is the whole of why it lives in the domain.
 * This text has to exist the moment a student decides to drop something, including with no
 * network and no key configured; a withdrawal message that waits on a spinner is one that
 * fails exactly when it is needed.
 */
describe('withdrawalFor', () => {
  it('names the thing being withdrawn from', () => {
    expect(withdrawalFor('Helping Sam move')).toContain('Helping Sam move')
  })

  it('writes something a student could actually send', () => {
    const message = withdrawalFor('FYP presentation help')

    // Long enough to be a message rather than a label, and in the first person, because the
    // student is the one sending it.
    expect(message.length).toBeGreaterThan(60)
    expect(message).toMatch(/\bI\b/)
  })

  /** Not async, and this is asserted rather than assumed: the moment this returns a promise
   *  it has become something that can fail to arrive. */
  it('answers immediately rather than returning a promise', () => {
    expect(withdrawalFor('Anything')).toEqual(expect.any(String))
  })
})
