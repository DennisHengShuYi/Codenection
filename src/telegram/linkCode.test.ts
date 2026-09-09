import { describe, expect, it } from 'vitest'
import { CODE_LIFETIME_MS, hasExpired, makeLinkCode, readStartCode } from './linkCode'

describe('makeLinkCode', () => {
  // A guessable code would let somebody link their own chat to a stranger's account, which
  // is the whole security boundary this feature rests on.
  it('does not repeat itself', () => {
    const codes = new Set(Array.from({ length: 200 }, () => makeLinkCode()))

    expect(codes.size).toBe(200)
  })

  it('is long enough to be worth guessing at', () => {
    expect(makeLinkCode().length).toBeGreaterThanOrEqual(8)
  })

  /**
   * A student may retype this from a phone screen rather than tapping the link, so the
   * alphabet leaves out the characters people confuse: O and 0, I, l and 1.
   */
  it('avoids characters that are misread when retyped', () => {
    const codes = Array.from({ length: 200 }, () => makeLinkCode()).join('')

    expect(codes).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })
})

describe('hasExpired', () => {
  const issued = 1_000_000

  it('accepts a code that was just made', () => {
    expect(hasExpired(issued, issued)).toBe(false)
  })

  it('accepts a code still inside its lifetime', () => {
    expect(hasExpired(issued, issued + CODE_LIFETIME_MS - 1)).toBe(false)
  })

  // The boundary has to fall one way deliberately rather than by accident. Expired is the
  // safer side.
  it('rejects a code exactly at its lifetime', () => {
    expect(hasExpired(issued, issued + CODE_LIFETIME_MS)).toBe(true)
  })

  it('rejects a code past its lifetime', () => {
    expect(hasExpired(issued, issued + CODE_LIFETIME_MS + 1)).toBe(true)
  })
})

describe('readStartCode', () => {
  it('reads the code out of a start command', () => {
    expect(readStartCode('/start ABC23456')).toBe('ABC23456')
  })

  // Nothing rather than an empty string: an empty string could match an empty stored code
  // and link a chat to whatever happened to be pending.
  it('finds nothing in a bare start command', () => {
    expect(readStartCode('/start')).toBeNull()
  })

  it('finds nothing in an ordinary message that mentions starting', () => {
    expect(readStartCode('I need to start my essay')).toBeNull()
  })

  it('ignores whitespace around the code', () => {
    expect(readStartCode('  /start   ABC23456  ')).toBe('ABC23456')
  })

  // A student retyping from a screen should not fail on capitals.
  it('accepts a code typed in the wrong case', () => {
    expect(readStartCode('/start abc23456')).toBe('ABC23456')
  })

  // Telegram addresses commands to a specific bot in group chats.
  it('reads the code from a command addressed to the bot by name', () => {
    expect(readStartCode('/start@codenection_bot ABC23456')).toBe('ABC23456')
  })

  it('finds nothing in an empty message', () => {
    expect(readStartCode('')).toBeNull()
  })
})
