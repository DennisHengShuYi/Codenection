import { describe, expect, it } from 'vitest'
import { crossingNotice } from './proactive'

/**
 * Ruling 26: the one capability the PWA does not have.
 *
 * Web push on iOS is unreliable and needs the app installed; Telegram always delivers. But a
 * bot that messages every day is one a student mutes in a week, and a muted bot is worse
 * than no bot -- so the only thing worth interrupting somebody for is the fortnight's answer
 * actually changing.
 */
describe('crossingNotice', () => {
  it('says nothing when the fortnight has not changed its answer', () => {
    expect(crossingNotice(6, 6)).toBeNull()
  })

  it('says nothing when it holds today and held yesterday', () => {
    expect(crossingNotice(null, null)).toBeNull()
  })

  /** The message that justifies the channel: something they accepted today moved the line. */
  it('speaks when a week that held now does not', () => {
    const notice = crossingNotice(null, 6)

    expect(notice).not.toBeNull()
    expect(notice).toContain('6')
  })

  it('speaks when the line moves closer', () => {
    expect(crossingNotice(9, 4)).toContain('4')
  })

  /**
   * Good news is worth a message too, and only this once. A student who cleared their week
   * should hear that the app noticed, or the channel only ever brings bad news and becomes
   * something to dread.
   */
  it('speaks when a week that did not hold now does', () => {
    expect(crossingNotice(4, null)).toMatch(/clear|holds|no longer/i)
  })

  /**
   * Moving further away is still an improvement, but it is not news -- the week was already
   * underwater and still is. Messaging on it would mean a notification most days, which is
   * how a channel gets muted.
   */
  it('stays quiet when the week is still underwater, just less so', () => {
    expect(crossingNotice(4, 9)).toBeNull()
  })

  it('stays quiet about a week that got worse but was already underwater', () => {
    expect(crossingNotice(9, 4)).not.toBeNull()
    expect(crossingNotice(4, 4)).toBeNull()
  })

  /** Nothing has ever been sent, so there is no change to report. A student should not be
   *  greeted by a crisis message the first time the cron runs. */
  it('says nothing on the very first run for a week that already did not hold', () => {
    expect(crossingNotice(undefined, 6)).toBeNull()
  })

  it('says nothing on the very first run for a week that holds', () => {
    expect(crossingNotice(undefined, null)).toBeNull()
  })
})
