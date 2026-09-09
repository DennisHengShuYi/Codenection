import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import {
  MAX_ECHO_LENGTH,
  appliedReply,
  confirmationReply,
  discardedReply,
  linkedReply,
  notLinkedReply,
  nothingUnderstoodReply,
  tooLongReply,
  unhandledReply,
} from './send'

const item = (title: string): ParsedItem => ({
  id: `item-${title}`,
  title,
  type: 'mental',
  hours: 2,
  deadlineDay: null,
  hard: false,
  confident: true,
})

describe('linkedReply', () => {
  it('confirms the link in words', () => {
    expect(linkedReply().text).toMatch(/linked/i)
  })

  // The reply goes to a chat we have only just decided to trust. It confirms the link and
  // nothing else -- no address, no id, nothing about the account behind it.
  it('names nothing about the account', () => {
    expect(linkedReply().text).not.toMatch(/@|\bid\b/i)
  })
})

describe('notLinkedReply', () => {
  it('says how to link rather than just refusing', () => {
    expect(notLinkedReply().text).toMatch(/link/i)
  })

  // Anyone can message the bot. An unlinked chat must learn nothing about whether an
  // account exists, only how to link one.
  it('says nothing about any account', () => {
    expect(notLinkedReply().text).not.toMatch(/@/)
  })
})

describe('unhandledReply', () => {
  it('says what the bot can do instead of failing silently', () => {
    expect(unhandledReply().text.length).toBeGreaterThan(0)
  })

  // §1.3's gamification rule and §7.9's "never punish a miss" both apply to a bot that
  // cannot help with something.
  it('does not scold', () => {
    expect(unhandledReply().text).not.toMatch(/sorry|cannot|invalid|error|wrong/i)
  })
})

describe('confirmationReply', () => {
  it('lists every item it understood', () => {
    const reply = confirmationReply('dump-1', [item('essay'), item('gym')])

    expect(reply.text).toContain('essay')
    expect(reply.text).toContain('gym')
  })

  it('offers a way to accept and a way to refuse', () => {
    const reply = confirmationReply('dump-1', [item('essay')])
    const actions = reply.buttons?.flatMap((row) => row.map((button) => button.data)) ?? []

    expect(actions).toContain('confirm:dump-1')
    expect(actions).toContain('discard:dump-1')
  })

  /**
   * The reply echoes what the student typed. Sent as plain text with no formatting mode, so
   * a brain dump full of asterisks or underscores cannot produce a mangled or misleading
   * message -- there is no formatting to break.
   */
  it('is plain text, so a student cannot break it with their own words', () => {
    const reply = confirmationReply('dump-1', [item('*essay* _due_ [friday](x)')])

    expect(reply.parseMode).toBeUndefined()
    expect(reply.text).toContain('*essay* _due_ [friday](x)')
  })

  it('shortens an item too long to send', () => {
    const reply = confirmationReply('dump-1', [item('e'.repeat(MAX_ECHO_LENGTH + 200))])

    expect(reply.text.length).toBeLessThan(MAX_ECHO_LENGTH + 200)
  })
})

describe('nothingUnderstoodReply', () => {
  it('says so plainly', () => {
    expect(nothingUnderstoodReply().text.length).toBeGreaterThan(0)
  })

  // Nothing to press: offering a confirmation for an empty list invites somebody to confirm
  // nothing and wonder why their week did not change.
  it('offers no buttons', () => {
    expect(nothingUnderstoodReply().buttons).toBeUndefined()
  })
})

describe('appliedReply', () => {
  it('says how many things were added', () => {
    expect(appliedReply(3).text).toMatch(/3/)
  })

  it('reads correctly for a single item', () => {
    expect(appliedReply(1).text).not.toMatch(/1 items/)
  })
})

describe('discardedReply', () => {
  it('confirms that nothing was kept', () => {
    expect(discardedReply().text).toMatch(/nothing|discard|not added/i)
  })
})

describe('tooLongReply', () => {
  // Refused in words rather than silently truncated: a student whose brain dump was quietly
  // cut in half would never know which half the app kept.
  it('explains rather than truncating', () => {
    expect(tooLongReply().text).toMatch(/shorter|too long|split/i)
  })
})
