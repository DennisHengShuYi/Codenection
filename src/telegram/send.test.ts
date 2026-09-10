import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import {
  MAX_ECHO_LENGTH,
  appliedReply,
  askReply,
  blockAnsweredReply,
  blocksReply,
  helpReply,
  microStartReply,
  needRequestReply,
  needTaskReply,
  noGapReply,
  restReply,
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
  kind: 'studyBlock',
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

describe('helpReply', () => {
  it('names every command a student can use', () => {
    const text = helpReply().text

    for (const command of ['today', 'yesterday', 'rest', 'stuck', 'ask']) {
      expect(text).toContain(`/${command}`)
    }
  })

  it('says a plain message is a brain dump, since that needs no command', () => {
    expect(helpReply().text).toMatch(/just (type|send)|plain message|anything else/i)
  })
})

describe('blocksReply', () => {
  const blocks = [
    { id: 'b1', title: 'Ethics essay', startHour: 9, type: 'mental' as const, hours: 2, dayIndex: 1 },
    { id: 'b2', title: 'Shift', startHour: 17, type: 'social' as const, hours: 3, dayIndex: 1 },
  ]

  it('names each block and when it was', () => {
    const reply = blocksReply('today', blocks)

    expect(reply.text).toContain('Ethics essay')
    expect(reply.text).toContain('Shift')
  })

  // §8b②: the same four answers as the today card, in the same order, so a student who
  // answers in both places is never asked two different questions.
  it('offers the same four answers as the today card, for the first unanswered block', () => {
    const buttons = blocksReply('today', blocks).buttons?.flat() ?? []

    expect(buttons.map((button) => button.label)).toEqual([
      "Didn't happen",
      'Took less',
      'About right',
      'Took longer',
    ])
  })

  // §8b②: the callback is the only place the block's type, planned hours and day index
  // survive the round trip back to `recordBlockAnswer`.
  it("carries the first block's type, planned hours and day index in every button", () => {
    const actions = blocksReply('today', blocks).buttons?.flat().map((button) => button.data) ?? []

    expect(actions.every((action) => action.startsWith('block:b1:m:2:1:'))).toBe(true)
  })

  it('says so plainly when the day had nothing on it', () => {
    const reply = blocksReply('today', [])

    expect(reply.text).toMatch(/nothing/i)
    expect(reply.buttons).toBeUndefined()
  })
})

describe('blockAnsweredReply', () => {
  /**
   * §7.9: never punish a miss. §1.3: the app reflects, it does not scold. A student who
   * did not do the thing is exactly the one whose data is most worth having, and a comment
   * on it is how they stop answering.
   */
  it('answers a miss neutrally, with no comment at all', () => {
    const text = blockAnsweredReply('didnt').text

    expect(text).not.toMatch(/sorry|shame|try|tomorrow|better|why|ok\?|should/i)
  })

  it('answers every one of the four answers just as plainly', () => {
    expect(blockAnsweredReply('didnt').text.length).toBeLessThan(60)
    expect(blockAnsweredReply('less').text.length).toBeLessThan(60)
    expect(blockAnsweredReply('right').text.length).toBeLessThan(60)
    expect(blockAnsweredReply('longer').text.length).toBeLessThan(60)
  })
})

describe('restReply', () => {
  const prescription = {
    type: 'physical' as const,
    kind: 'lightExercise' as const,
    title: 'A walk outside',
    startHour: 15,
    hours: 1,
    protectedRest: true as const,
  }

  it('offers the one thing, and when', () => {
    const reply = restReply(prescription)

    expect(reply.text).toContain('A walk outside')
    expect(reply.text).toMatch(/15|3\s?pm/i)
  })

  /**
   * §5.2: one option only. Every extra option lowers the odds of any action at all.
   *
   * Declining is not an option in that sense -- it is the way out -- so what is counted is
   * the things that can be accepted. The first version of this counted anything starting
   * `rest:`, which caught the decline too and read as a failure when it was not one.
   */
  it('offers exactly one thing to accept', () => {
    const actions = restReply(prescription).buttons?.flat().map((b) => b.data) ?? []

    expect(actions.filter((a) => a.startsWith('rest:accept'))).toHaveLength(1)
    expect(actions.filter((a) => a === 'rest:decline')).toHaveLength(1)
  })

  it('says plainly when the day has no room, rather than suggesting the impossible', () => {
    const reply = noGapReply()

    expect(reply.text.length).toBeGreaterThan(0)
    expect(reply.buttons).toBeUndefined()
  })
})

describe('microStartReply', () => {
  it('gives the one action and nothing else', () => {
    const reply = microStartReply({ action: 'Open the document and write the title.', minutes: 8 })

    expect(reply.text).toContain('Open the document')
    expect(reply.buttons).toBeUndefined()
  })

  it('asks which task when none was named', () => {
    expect(needTaskReply().text).toMatch(/which|what/i)
  })
})

describe('askReply', () => {
  const cost = {
    firstDeficitDayBefore: 21,
    firstDeficitDayAfter: 14,
    floorBefore: 40,
    floorAfter: 22,
    deepestDrop: 8.7,
    capacityAfter: 106,
    eveningsEquivalent: 3,
    absorbable: false,
  }

  const drafts = [
    { tone: 'decline' as const, text: 'I cannot take this on this week.' },
    { tone: 'defer' as const, text: 'Not this week — could it wait until the 20th?' },
    { tone: 'accept' as const, text: 'Yes, but I will drop the gym to do it.' },
  ]

  // §2.3: never "this takes 6 hours". Always what it costs in what gets given up.
  it('prices it in what gets given up, not in hours', () => {
    const text = askReply(cost, drafts).text

    expect(text).toMatch(/evening/i)
    expect(text).not.toMatch(/\d+(\.\d+)?\s*hours?/i)
  })

  it('names the deficit crossing moving, and where it moves to', () => {
    expect(askReply(cost, drafts).text).toContain('14')
  })

  it('does not invent a crossing that did not move', () => {
    const unchanged = { ...cost, firstDeficitDayBefore: null, firstDeficitDayAfter: null }

    expect(askReply(unchanged, drafts).text).not.toMatch(/first bad day/i)
  })

  it('offers all three tones', () => {
    const text = askReply(cost, drafts).text

    expect(text).toContain('cannot take this on')
    expect(text).toContain('until the 20th')
    expect(text).toContain('drop the gym')
  })

  /**
   * Real line breaks, not the two characters backslash-n.
   *
   * An escaping slip produced exactly that and every substring assertion still passed,
   * because `toContain` cannot tell a separator from a literal. The student would have seen
   * "
" printed between every line.
   */
  it('separates the drafts with actual line breaks', () => {
    const text = askReply(cost, drafts).text

    expect(text.split(String.fromCharCode(10)).length).toBeGreaterThan(3)
    expect(text).not.toContain(String.fromCharCode(92) + 'n')
  })

  /**
   * §2.3's rule, and the one place a bot could quietly break it: the app does the work of
   * declining and the student keeps the decision. There must be nothing to press that
   * sends anything to anybody.
   */
  it('offers nothing that could send the reply', () => {
    const reply = askReply(cost, drafts)

    expect(reply.buttons).toBeUndefined()
    expect(reply.text).not.toMatch(/tap to send|send it|forward this/i)
  })

  it('asks what the request was when nothing followed the command', () => {
    expect(needRequestReply().text.length).toBeGreaterThan(0)
  })
})

describe('the wording at its edges', () => {
  it('labels yesterday as yesterday, not as today', () => {
    const reply = blocksReply('yesterday', [
      { id: 'b1', title: 'Shift', startHour: 17, type: 'social', hours: 3, dayIndex: 1 },
    ])

    expect(reply.text).toMatch(/yesterday/i)
  })

  // A request that costs no evenings still has to read as a sentence rather than "about 0".
  it('reads sensibly when the request costs almost nothing', () => {
    const text = askReply(
      { firstDeficitDayBefore: null, firstDeficitDayAfter: null, eveningsEquivalent: 0 },
      [{ tone: 'decline', text: 'No.' }],
    ).text

    expect(text).not.toMatch(/about 0/)
  })

  it('reads sensibly for exactly one evening', () => {
    const text = askReply(
      { firstDeficitDayBefore: null, firstDeficitDayAfter: null, eveningsEquivalent: 1 },
      [{ tone: 'decline', text: 'No.' }],
    ).text

    expect(text).toMatch(/one evening/i)
  })

  // A drafter that returned fewer than three tones must not leave "undefined" in the reply.
  it('leaves a gap rather than the word undefined when a tone is missing', () => {
    const text = askReply(
      { firstDeficitDayBefore: null, firstDeficitDayAfter: null, eveningsEquivalent: 2 },
      [{ tone: 'decline', text: 'No.' }],
    ).text

    expect(text).not.toMatch(/undefined/)
  })
})
