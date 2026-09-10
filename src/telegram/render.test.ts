import { describe, expect, it } from 'vitest'
import type { ParsedItem } from '../ai'
import {
  MAX_ECHO_LENGTH,
  appliedReply,
  askReply,
  blockAnsweredReply,
  blocksReply,
  checkInReply,
  scheduleReply,
  lapsedReply,
  rebalanceReply,
  weekReply,
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
} from './render'

const item = (title: string): ParsedItem => ({
  id: `item-${title}`,
  title,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  deadlineDay: null,
  fixed: false,
  confident: true,
  repeat: null,
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

    for (const command of [
      'week',
      'today',
      'yesterday',
      'day',
      'rebalance',
      'rest',
      'stuck',
      'ask',
      'lapsed',
      'schedule',
      'checkin',
    ]) {
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

  /**
   * The bot used to ask about `blocks[0]` unconditionally, so a student who answered it got
   * asked about the same block again on the next `/today` -- for ever -- while every other
   * block on the day stayed unreachable from their phone. The app has never behaved that
   * way: `blockToAsk` skips what the log already holds and moves on.
   */
  it('moves on to the next block once the first has been answered', () => {
    const actions = blocksReply('today', blocks, ['b1']).buttons?.flat().map((b) => b.data) ?? []

    expect(actions.length).toBe(4)
    expect(actions.every((action) => action.startsWith('block:b2:s:3:1:'))).toBe(true)
  })

  it('asks nothing once every block on the day has been answered', () => {
    const answered = blocksReply('today', blocks, ['b1', 'b2'])

    expect(answered.buttons).toBeUndefined()
    // The day is still worth listing -- the student asked what was on it.
    expect(answered.text).toContain('Ethics essay')
    expect(answered.text).toContain('Shift')
  })

  it('still lists every block on the day, not only the one being asked about', () => {
    const text = blocksReply('today', blocks, ['b1']).text

    expect(text).toContain('Ethics essay')
    expect(text).toContain('Shift')
  })

  /**
   * §23: Telegram silently drops a `sendMessage` whose `callback_data` exceeds 64 bytes,
   * and `api/telegram.ts` ignores the response -- so the failure mode is a keyboard that
   * simply never appears, with nothing logged anywhere. The single-character type and
   * answer codes exist to buy headroom; this is the test that proves the budget is still
   * being met rather than merely intended.
   */
  it('keeps every callback payload inside the 64-byte limit Telegram enforces', () => {
    const longest = [
      {
        id: 'added-1757000000000-24-parsed-123',
        title: 'A very long block title that does not enter the payload at all',
        startHour: 9,
        type: 'physical' as const,
        hours: 10.5,
        dayIndex: 20,
      },
    ]

    for (const button of blocksReply('today', longest).buttons?.flat() ?? []) {
      expect(new TextEncoder().encode(button.data).length).toBeLessThanOrEqual(64)
    }
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

/**
 * §22's parity renderers.
 *
 * The rule these are written to: the bot never decides anything. Every number below is
 * computed in `src/domain` or `src/optimizer` and handed here already made -- if a
 * threshold comparison ever appears in this file, it belongs somewhere else and the app
 * should be reading it from the same place.
 */
describe('weekReply', () => {
  const summary = {
    reserve: 62,
    firstDeficitDay: 6,
    accuracy: 'Measured over 5 days: off by about 7 points.',
    bias: 'You underestimate study and writing by about 1.4×. We pad it automatically.',
  }

  it('leads with where the student is now', () => {
    expect(weekReply(summary).text).toContain('62')
  })

  it('names the day the fortnight stops holding', () => {
    expect(weekReply(summary).text).toMatch(/day 6/i)
  })

  /** §8.2: the 21-day projection is a decision aid and is never described as validated. */
  it('says plainly when the fortnight holds', () => {
    expect(weekReply({ ...summary, firstDeficitDay: null }).text).toMatch(/holds|clear|nothing/i)
  })

  /** The two honesty lines the app shows and chat could not: what the app measured about
   *  its own accuracy, and what it measured about the student's estimates. */
  it('carries the accuracy figure and the reality-check line across', () => {
    const text = weekReply(summary).text

    expect(text).toContain('off by about 7 points')
    expect(text).toContain('underestimate study and writing')
  })

  it('omits a bias line there is nothing to say about', () => {
    expect(weekReply({ ...summary, bias: null }).text).not.toMatch(/underestimate/)
  })
})

describe('rebalanceReply', () => {
  it('reports what the solver did in its own words', () => {
    expect(rebalanceReply('Moved two blocks; your worst day goes from 31 to 44.', null).text).toContain(
      'worst day goes from 31 to 44',
    )
  })

  /** §2.5: "nothing to move, but here is the one thing that would help" is the likelier
   *  headline for a real final-year student, not a consolation prize. */
  it('offers the single best remaining move when the solver found none', () => {
    const reply = rebalanceReply('Nothing I tried improved the week.', 'move the laundry to Saturday')

    expect(reply.text).toContain('move the laundry to Saturday')
  })

  it('says nothing extra when the solver already helped', () => {
    expect(rebalanceReply('Moved two blocks.', null).text).not.toMatch(/would still/i)
  })
})

describe('lapsedReply', () => {
  it('names what has fallen through', () => {
    const reply = lapsedReply([{ title: 'Cover Amir’s shift' }])

    expect(reply.text).toContain('Cover Amir’s shift')
  })

  it('says so plainly when nothing has', () => {
    expect(lapsedReply([]).text).toMatch(/nothing|still standing|all good/i)
  })
})

/**
 * §22's last three gaps: the fortnight at a glance, the daily check-in, and the provisional
 * yes. All three existed in the app and none was reachable from chat.
 */
describe('scheduleReply', () => {
  const cells = Array.from({ length: 21 }, (_, dayIndex) => ({
    dayIndex,
    date: null,
    band: dayIndex % 3 === 0 ? ('heavy' as const) : ('light' as const),
    deficit: dayIndex === 6,
    unconfirmed: false,
  }))

  it('shows the whole horizon, not a slice of it', () => {
    const text = scheduleReply(cells).text

    expect(text).toContain('0')
    expect(text).toContain('20')
  })

  /** §1.5: never shade alone. A chat message has no colour at all, so the band is a word. */
  it('names each day s load in words', () => {
    expect(scheduleReply(cells).text).toMatch(/heavy/i)
    expect(scheduleReply(cells).text).toMatch(/light/i)
  })

  it('marks the day the fortnight stops holding', () => {
    expect(scheduleReply(cells).text).toMatch(/day 6/i)
  })

  it('says so plainly when there is no deficit at all', () => {
    const clear = cells.map((cell) => ({ ...cell, deficit: false }))

    expect(scheduleReply(clear).text).toMatch(/holds|clear/i)
  })
})

describe('checkInReply', () => {
  it('asks for energy in the same five bands the today card offers', () => {
    const labels = checkInReply('energy').buttons?.flat().map((button) => button.label) ?? []

    expect(labels).toHaveLength(5)
    expect(labels.join(' ')).toMatch(/empty/i)
  })

  it('asks for sleep in the same four buckets', () => {
    const labels = checkInReply('sleep').buttons?.flat().map((button) => button.label) ?? []

    expect(labels).toHaveLength(4)
  })

  /** A student who answers in both places must not meet two different questions (§8b②). */
  it('carries the answer in the callback, so nothing has to be remembered between messages', () => {
    const data = checkInReply('energy').buttons?.flat().map((button) => button.data) ?? []

    expect(data.every((entry) => entry.startsWith('energy:'))).toBe(true)
  })
})

describe('askReply offering a provisional yes', () => {
  const cost = { firstDeficitDayBefore: null, firstDeficitDayAfter: 6, eveningsEquivalent: 2 }
  const drafts = [
    { tone: 'decline' as const, text: 'no' },
    { tone: 'defer' as const, text: 'later' },
    { tone: 'accept' as const, text: 'yes' },
  ]

  /**
   * The existing "deliberately no buttons" note is about never sending anything to anybody
   * on the student's behalf, and that still holds -- this writes only to their own week.
   * §2.3's provisional yes is the whole mechanism: saying yes is reversible by default, and
   * it lapses on its own unless the reserve can still hold it.
   */
  it('offers to take it on provisionally', () => {
    const data = askReply(cost, drafts, 'ask-1').buttons?.flat().map((b) => b.data) ?? []

    expect(data).toContain('takeon:ask-1')
  })

  it('still sends nothing to anybody', () => {
    const labels = askReply(cost, drafts, 'ask-1').buttons?.flat().map((b) => b.label) ?? []

    expect(labels.join(' ')).not.toMatch(/send|reply to them|message them/i)
  })

  it('offers nothing when there is no pending ask to accept', () => {
    expect(askReply(cost, drafts).buttons).toBeUndefined()
  })
})
