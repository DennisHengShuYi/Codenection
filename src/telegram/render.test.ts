import { COMMANDS } from './commands'
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
  startHour: null,
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

  /**
   * §1.4: flagged rather than silently guessed.
   *
   * This dropped `confident` entirely, so a row the model had guessed at looked identical to
   * a plainly-stated one immediately above a one-tap "Add them" -- while the app's own chip
   * has flagged it since §1.4 was built. Both directions asserted, because a flag on
   * everything is as useless as a flag on nothing.
   */
  it('flags a row it was not sure about, and leaves a confident one plain', () => {
    const reply = confirmationReply('dump-1', [
      { ...item('essay'), confident: false },
      item('gym'),
    ])

    const [unsureLine, confidentLine] = reply.text
      .split(String.fromCharCode(10))
      .filter((line) => line.startsWith('•'))

    expect(unsureLine).toMatch(/not sure/i)
    expect(confidentLine).not.toMatch(/not sure/i)
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
    const reply = blocksReply('today', blocks, [], { today: 1, hour: 23 })

    expect(reply.text).toContain('Ethics essay')
    expect(reply.text).toContain('Shift')
  })

  // §8b②: the same four answers as the today card, in the same order, so a student who
  // answers in both places is never asked two different questions.
  it('offers the same four answers as the today card, for the first unanswered block', () => {
    const buttons = blocksReply('today', blocks, [], { today: 1, hour: 23 }).buttons?.flat() ?? []

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
    const actions = blocksReply('today', blocks, [], { today: 1, hour: 23 }).buttons?.flat().map((button) => button.data) ?? []

    expect(actions.every((action) => action.startsWith('block:b1:m:2:1:'))).toBe(true)
  })

  it('says so plainly when the day had nothing on it', () => {
    const reply = blocksReply('today', [], [], { today: 1, hour: 23 })

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
    const actions = blocksReply('today', blocks, ['b1'], { today: 1, hour: 23 }).buttons?.flat().map((b) => b.data) ?? []

    expect(actions.length).toBe(4)
    expect(actions.every((action) => action.startsWith('block:b2:s:3:1:'))).toBe(true)
  })

  it('asks nothing once every block on the day has been answered', () => {
    const answered = blocksReply('today', blocks, ['b1', 'b2'], { today: 1, hour: 23 })

    expect(answered.buttons).toBeUndefined()
    // The day is still worth listing -- the student asked what was on it.
    expect(answered.text).toContain('Ethics essay')
    expect(answered.text).toContain('Shift')
  })

  it('still lists every block on the day, not only the one being asked about', () => {
    const text = blocksReply('today', blocks, ['b1'], { today: 1, hour: 23 }).text

    expect(text).toContain('Ethics essay')
    expect(text).toContain('Shift')
  })

  /**
   * Ruling 23: Telegram silently drops a `sendMessage` whose `callback_data` exceeds 64 bytes,
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

    for (const button of blocksReply('today', longest, [], { today: 1, hour: 23 }).buttons?.flat() ?? []) {
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
    const text = askReply(cost, drafts, null).text

    expect(text).toMatch(/evening/i)
    expect(text).not.toMatch(/\d+(\.\d+)?\s*hours?/i)
  })

  /** By name, from `dayLabel` at the call site. The raw index it used to print is the
   *  model's counting and a day short of the student's. */
  it('names the deficit crossing moving, and where it moves to', () => {
    const text = askReply(cost, drafts, 'Wed 24 Sep').text

    expect(text).toContain('Wed 24 Sep')
    expect(text).not.toMatch(/day \d/i)
  })

  it('does not invent a crossing that did not move', () => {
    const unchanged = { ...cost, firstDeficitDayBefore: null, firstDeficitDayAfter: null }

    expect(askReply(unchanged, drafts, null).text).not.toMatch(/first bad day/i)
  })

  it('offers all three tones', () => {
    const text = askReply(cost, drafts, null).text

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
    const text = askReply(cost, drafts, null).text

    expect(text.split(String.fromCharCode(10)).length).toBeGreaterThan(3)
    expect(text).not.toContain(String.fromCharCode(92) + 'n')
  })

  /**
   * §2.3's rule, and the one place a bot could quietly break it: the app does the work of
   * declining and the student keeps the decision. There must be nothing to press that
   * sends anything to anybody.
   */
  it('offers nothing that could send the reply', () => {
    const reply = askReply(cost, drafts, null)

    expect(reply.buttons).toBeUndefined()
    expect(reply.text).not.toMatch(/tap to send|send it|forward this/i)
  })

  it('asks what the request was when nothing followed the command', () => {
    expect(needRequestReply().text.length).toBeGreaterThan(0)
  })
})

describe('the wording at its edges', () => {
  it('labels yesterday as yesterday, not as today', () => {
    const reply = blocksReply(
      'yesterday',
      [{ id: 'b1', title: 'Shift', startHour: 17, type: 'social', hours: 3, dayIndex: 1 }],
      [],
      { today: 2, hour: 9 },
    )

    expect(reply.text).toMatch(/yesterday/i)
  })

  // A request that costs no evenings still has to read as a sentence rather than "about 0".
  it('reads sensibly when the request costs almost nothing', () => {
    const text = askReply(
      { firstDeficitDayBefore: null, firstDeficitDayAfter: null, eveningsEquivalent: 0 },
      [{ tone: 'decline', text: 'No.' }],
      null,
    ).text

    expect(text).not.toMatch(/about 0/)
  })

  it('reads sensibly for exactly one evening', () => {
    const text = askReply(
      { firstDeficitDayBefore: null, firstDeficitDayAfter: null, eveningsEquivalent: 1 },
      [{ tone: 'decline', text: 'No.' }],
      null,
    ).text

    expect(text).toMatch(/one evening/i)
  })

  // A drafter that returned fewer than three tones must not leave "undefined" in the reply.
  it('leaves a gap rather than the word undefined when a tone is missing', () => {
    const text = askReply(
      { firstDeficitDayBefore: null, firstDeficitDayAfter: null, eveningsEquivalent: 2 },
      [{ tone: 'decline', text: 'No.' }],
      null,
    ).text

    expect(text).not.toMatch(/undefined/)
  })
})

/**
 * Ruling 22's parity renderers.
 *
 * The rule these are written to: the bot never decides anything. Every number below is
 * computed in `src/domain` or `src/optimizer` and handed here already made -- if a
 * threshold comparison ever appears in this file, it belongs somewhere else and the app
 * should be reading it from the same place.
 */
describe('weekReply', () => {
  const summary = {
    reserve: 62,
    firstDeficitDayLabel: 'Sat 12 Sep',
    accuracy: 'Measured over 5 days: off by about 7 points.',
    bias: 'You underestimate study and writing by about 1.4×. We pad it automatically.',
  }

  it('leads with where the student is now', () => {
    expect(weekReply(summary).text).toContain('62')
  })

  /**
   * By name, not by index. This asserted `/day 6/`, which is what the bot used to print --
   * the model's own counting, and one short of what a student calls that day. The label is
   * built by `dayLabel` at the call site, where the week's anchor is in hand.
   */
  it('names the day the fortnight stops holding', () => {
    expect(weekReply(summary).text).toContain('Sat 12 Sep')
    expect(weekReply(summary).text).not.toMatch(/day \d/i)
  })

  /** §8.2: the 21-day projection is a decision aid and is never described as validated. */
  it('says plainly when the fortnight holds', () => {
    expect(weekReply({ ...summary, firstDeficitDayLabel: null }).text).toMatch(/holds|clear|nothing/i)
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
    expect(rebalanceReply('Moved two blocks; your worst day goes from 31 to 44.', null, 'abc123').text).toContain(
      'worst day goes from 31 to 44',
    )
  })

  /** §2.5: "nothing to move, but here is the one thing that would help" is the likelier
   *  headline for a real final-year student, not a consolation prize. */
  it('offers the single best remaining move when the solver found none', () => {
    const reply = rebalanceReply('Nothing I tried improved the week.', 'move the laundry to Saturday', 'abc123')

    expect(reply.text).toContain('move the laundry to Saturday')
  })

  it('says nothing extra when the solver already helped', () => {
    expect(rebalanceReply('Moved two blocks.', null, 'abc123').text).not.toMatch(/would still/i)
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
 * Ruling 22's last three gaps: the fortnight at a glance, the daily check-in, and the provisional
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
    const data = askReply(cost, drafts, null, 'ask-1').buttons?.flat().map((b) => b.data) ?? []

    expect(data).toContain('takeon:ask-1')
  })

  it('still sends nothing to anybody', () => {
    const labels = askReply(cost, drafts, null, 'ask-1').buttons?.flat().map((b) => b.label) ?? []

    expect(labels.join(' ')).not.toMatch(/send|reply to them|message them/i)
  })

  it('offers nothing when there is no pending ask to accept', () => {
    expect(askReply(cost, drafts, null).buttons).toBeUndefined()
  })
})

/**
 * Ruling 24: navigation without a session table. The fortnight offers its days; opening one
 * replaces the message rather than adding to the log, and stepping back replaces it again.
 * Nothing is remembered between messages -- the day index travels in the callback.
 */
describe('scheduleReply as navigation', () => {
  const cells = Array.from({ length: 21 }, (_, dayIndex) => ({
    dayIndex,
    date: null,
    band: 'light' as const,
    deficit: false,
    unconfirmed: false,
  }))

  it('offers a way into each day', () => {
    const data = scheduleReply(cells).buttons?.flat().map((button) => button.data) ?? []

    expect(data).toContain('open:3')
  })

  /** Telegram caps a keyboard's usable width, and twenty-one buttons in one row is
   *  unreadable on a phone. */
  it('lays the fortnight out in rows rather than one long line', () => {
    const rows = scheduleReply(cells).buttons ?? []

    expect(rows.length).toBeGreaterThan(1)
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(7)
  })

  it('replaces the message it came from when it is a step back', () => {
    expect(scheduleReply(cells, { replacing: true }).replaceMessage).toBe(true)
  })

  it('is an ordinary message when it was asked for directly', () => {
    expect(scheduleReply(cells).replaceMessage).toBeUndefined()
  })
})

describe('blocksReply as a day opened from the fortnight', () => {
  const blocks = [
    { id: 'b1', title: 'Ethics essay', startHour: 9, type: 'mental' as const, hours: 2, dayIndex: 1 },
  ]

  it('offers a way back to the fortnight', () => {
    const data = blocksReply('today', blocks, [], { today: 1, hour: 23 }, { replacing: true }).buttons?.flat().map((b) => b.data) ?? []

    expect(data).toContain('back:schedule')
  })

  it('replaces the fortnight it was opened from', () => {
    expect(blocksReply('today', blocks, [], { today: 1, hour: 23 }, { replacing: true }).replaceMessage).toBe(true)
  })

  it('stays an ordinary message for a plain /today', () => {
    expect(blocksReply('today', blocks, [], { today: 1, hour: 23 }).replaceMessage).toBeUndefined()
    expect(blocksReply('today', blocks, [], { today: 1, hour: 23 }).buttons?.flat().some((b) => b.data === 'back:schedule')).toBe(false)
  })
})

/**
 * Ruling 62: `/help` is the whole surface a student can see at once, so anything the door
 * accepts and this does not mention is a feature nobody will discover. Photos and voice
 * notes were both wired in `api/telegram.ts` and named nowhere.
 */
describe('the help text against what the door actually accepts', () => {
  it('names every command the parser knows', () => {
    const text = helpReply().text

    for (const name of COMMANDS.filter((command) => command !== 'help')) {
      expect(text, `/${name} is handled and unmentioned`).toContain(`/${name}`)
    }
  })

  it('says a photo works, because it does', () => {
    expect(helpReply().text).toMatch(/photo/i)
  })

  it('says a voice note works, because it does', () => {
    expect(helpReply().text).toMatch(/voice/i)
  })
})

/**
 * The bot asked about blocks that had not happened.
 *
 * `blocksReply` took the first unanswered block on the day with no clock in sight, so
 * `/today` at 9am asked "Did the 8pm essay happen?" and `/day` asked about days still ahead.
 * Whatever the student tapped went into the block log as a measurement of a block they had
 * not lived, and estimate bias -- the number behind the app's published accuracy -- is
 * computed from those.
 *
 * The today card has never done this: `blockToAsk` has required a clock since it was
 * written, for this exact reason. §8b② says the two surfaces must not ask different
 * questions, and two copies of one rule is how they came to. `hasHappened` is one rule in
 * `domain/dayBlocks` now, and this is its second caller.
 */
describe('blocksReply, asking only about what has happened', () => {
  const evening = {
    id: 'b1',
    title: 'Ethics essay',
    startHour: 20,
    type: 'mental' as const,
    hours: 2,
    dayIndex: 1,
  }

  it('lists a block that has not happened but does not ask about it', () => {
    const reply = blocksReply('today', [evening], [], { today: 1, hour: 9 })

    expect(reply.text).toContain('Ethics essay')
    expect(reply.text).not.toMatch(/did .*happen/i)
    expect(reply.buttons).toBeUndefined()
  })

  it('asks once the block has finished', () => {
    const reply = blocksReply('today', [evening], [], { today: 1, hour: 22 })

    expect(reply.text).toMatch(/did .*happen/i)
  })

  it('never asks about a day still ahead', () => {
    const reply = blocksReply('today', [{ ...evening, dayIndex: 5 }], [], { today: 1, hour: 23 })

    expect(reply.buttons).toBeUndefined()
  })

  it('asks about anything on a day already behind us, whatever the hour', () => {
    const reply = blocksReply('yesterday', [{ ...evening, dayIndex: 0 }], [], { today: 1, hour: 1 })

    expect(reply.text).toMatch(/did .*happen/i)
  })

  /** Opened from the fortnight, a day with nothing to ask about must still offer the way
   *  back -- otherwise every future day is a dead end in the chat. */
  it('keeps the way back on a day it has nothing to ask about', () => {
    const reply = blocksReply('today', [evening], [], { today: 1, hour: 9 }, { replacing: true })

    expect(reply.replaceMessage).toBe(true)
    expect(reply.buttons?.flat().map((button) => button.data)).toContain('back:schedule')
  })
})
