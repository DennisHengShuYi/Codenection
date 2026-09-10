import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../ai'
import { outcomesFrom, type BlockRecord } from '../domain/blockLog'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { handleIntent, type BlockAnswerInput, type ChatStore } from './handle'
import type { PendingDump } from './brainDump'
import { blocksReply } from './send'
import { readUpdate } from './update'

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const parsed = (title: string): ParsedItem => ({
  id: `id-${title}`,
  title,
  type: 'mental',
  kind: 'studyBlock',
  hours: 2,
  deadlineDay: null,
  fixed: false,
  confident: true,
})

interface Harness {
  store: ChatStore
  saved: Schedule[]
  blockAnswers: BlockAnswerInput[]
  pendings: PendingDump[]
  answered: string[]
  linked: Array<{ chatId: number; accountId: string }>
}

function harness(over: Partial<ChatStore> = {}): Harness {
  const saved: Schedule[] = []
  const blockAnswers: BlockAnswerInput[] = []
  const pendings: PendingDump[] = []
  const answered: string[] = []
  const linked: Array<{ chatId: number; accountId: string }> = []

  const store: ChatStore = {
    accountForChat: async () => 'account-1',
    claimLinkCode: async () => 'account-1',
    linkChat: async (chatId, accountId) => {
      linked.push({ chatId, accountId })
    },
    loadWeek: async () => week(),
    saveWeek: async (_accountId, next) => {
      saved.push(next)
    },
    savePending: async (_accountId, pending) => {
      pendings.push(pending)
    },
    findPending: async () => null,
    markAnswered: async (_accountId, dumpId) => {
      answered.push(dumpId)
    },
    recordBlockAnswer: async (_accountId, answer) => {
      blockAnswers.push(answer)
    },
    loadBlockLog: async () => [],
    ...over,
  }

  return { store, saved, blockAnswers, pendings, answered, linked }
}

const parse = vi.fn()
vi.mock('../ai', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  parseBrainDump: (text: string) => parse(text),
}))

beforeEach(() => {
  parse.mockReset()
  parse.mockResolvedValue({ items: [parsed('essay')], source: 'model' })
})

describe('linking', () => {
  it('links the chat when the code is good', async () => {
    const h = harness()

    const reply = await handleIntent({ kind: 'link', chatId: 7, code: 'ABC23456' }, h.store, 1000)

    expect(h.linked).toEqual([{ chatId: 7, accountId: 'account-1' }])
    expect(reply?.text).toMatch(/linked/i)
  })

  // An expired or invented code must not link anything, and must not say whether the code
  // was wrong or merely old -- either would help somebody guess.
  it('links nothing when the code is not good', async () => {
    const h = harness({ claimLinkCode: async () => null })

    const reply = await handleIntent({ kind: 'link', chatId: 7, code: 'NOPE' }, h.store, 1000)

    expect(h.linked).toEqual([])
    expect(reply?.text).toMatch(/not linked/i)
  })
})

describe('an unlinked chat', () => {
  const unlinked = { accountForChat: async () => null }

  it('is told how to link rather than acted on', async () => {
    const h = harness(unlinked)

    const reply = await handleIntent({ kind: 'plan', chatId: 7, text: 'essay' }, h.store, 1000)

    expect(reply?.text).toMatch(/not linked/i)
  })

  // The point of the guard: nothing about an account may happen for a chat we have not
  // verified. Not a parse, not a write, not a pending record.
  it('has nothing parsed, stored or written for it', async () => {
    const h = harness(unlinked)

    await handleIntent({ kind: 'plan', chatId: 7, text: 'essay' }, h.store, 1000)
    await handleIntent({ kind: 'confirm', chatId: 7, dumpId: 'd1', accepted: true }, h.store, 1000)

    expect(parse).not.toHaveBeenCalled()
    expect(h.saved).toEqual([])
    expect(h.pendings).toEqual([])
  })
})

describe('planning', () => {
  it('parses the text and offers what it understood', async () => {
    const h = harness()

    const reply = await handleIntent({ kind: 'plan', chatId: 7, text: 'essay' }, h.store, 1000)

    expect(parse).toHaveBeenCalledWith('essay')
    expect(reply?.buttons).toBeDefined()
  })

  it('stores the parse as pending so a button can answer it', async () => {
    const h = harness()

    await handleIntent({ kind: 'plan', chatId: 7, text: 'essay' }, h.store, 1000)

    expect(h.pendings).toHaveLength(1)
    expect(h.pendings[0]?.items).toHaveLength(1)
  })

  // Nothing may be written by describing a week. Only a confirmation writes.
  it('writes nothing to the week yet', async () => {
    const h = harness()

    await handleIntent({ kind: 'plan', chatId: 7, text: 'essay' }, h.store, 1000)

    expect(h.saved).toEqual([])
  })

  // Refused in words rather than silently truncated, and refused before the model is called
  // so an oversized message cannot cost anything.
  it('refuses a message longer than the app allows, without parsing it', async () => {
    const h = harness()

    const reply = await handleIntent(
      { kind: 'plan', chatId: 7, text: 'x'.repeat(5000) },
      h.store,
      1000,
    )

    expect(reply?.text).toMatch(/shorter|too long|split/i)
    expect(parse).not.toHaveBeenCalled()
    expect(h.pendings).toEqual([])
  })
})

describe('confirming', () => {
  const open: PendingDump = { id: 'd1', items: [parsed('essay')], answeredAt: null }

  it('writes the week and marks the dump answered', async () => {
    const h = harness({ findPending: async () => open })

    const reply = await handleIntent(
      { kind: 'confirm', chatId: 7, dumpId: 'd1', accepted: true },
      h.store,
      1000,
    )

    expect(h.saved).toHaveLength(1)
    expect(h.answered).toEqual(['d1'])
    expect(reply?.text).toMatch(/added/i)
  })

  /**
   * The dump is marked answered before the week is written. If the write fails the student
   * is told, and a retry cannot double the week -- which is the safer way round, because a
   * missing item is visible and a doubled one is not.
   */
  it('does not write twice when the same confirmation arrives again', async () => {
    const h = harness({ findPending: async () => ({ ...open, answeredAt: 500 }) })

    await handleIntent({ kind: 'confirm', chatId: 7, dumpId: 'd1', accepted: true }, h.store, 1000)

    expect(h.saved).toEqual([])
  })

  it('writes nothing when the student discards it', async () => {
    const h = harness({ findPending: async () => open })

    const reply = await handleIntent(
      { kind: 'confirm', chatId: 7, dumpId: 'd1', accepted: false },
      h.store,
      1000,
    )

    expect(h.saved).toEqual([])
    expect(h.answered).toEqual(['d1'])
    expect(reply?.text).toMatch(/nothing|discard/i)
  })

  it('refuses a dump it has no record of', async () => {
    const h = harness({ findPending: async () => null })

    await handleIntent({ kind: 'confirm', chatId: 7, dumpId: 'gone', accepted: true }, h.store, 1000)

    expect(h.saved).toEqual([])
  })
})

describe('anything else', () => {
  it('gets a reply rather than silence', async () => {
    const h = harness()

    const reply = await handleIntent({ kind: 'unhandled', chatId: 7 }, h.store, 1000)

    expect(reply?.text.length).toBeGreaterThan(0)
  })

  // With no chat to answer there is nowhere to send anything.
  it('says nothing when there is no chat to say it to', async () => {
    const h = harness()

    expect(await handleIntent({ kind: 'unhandled', chatId: null }, h.store, 1000)).toBeNull()
  })
})

describe('the command surface', () => {
  const week = (items: unknown[] = [], start = { mental: 70, physical: 70, social: 70, errands: 70 }) => ({
    items,
    start,
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  })

  /** prescribe() only speaks when something is actually low -- see PRESCRIBE_BELOW. A
   *  comfortable week gets no advice, which is the point rather than a gap. */
  const depleted = { mental: 20, physical: 70, social: 70, errands: 70 }

  const studyBlock = {
    id: 'b1', title: 'Ethics essay', type: 'mental', kind: 'studyBlock', hours: 2,
    intensity: 1, dayIndex: 0, startHour: 9, fixed: true, deadlineDay: null, protectedRest: false,
  }

  const command = (name: string, argument = '') =>
    ({ kind: 'command', chatId: 7, name, argument }) as never

  it('answers /help with what it can do', async () => {
    const h = harness()

    const reply = await handleIntent(command('help'), h.store, 1000)

    expect(reply?.text).toContain('/today')
  })

  it('answers /today with the day’s blocks', async () => {
    const h = harness({ loadWeek: async () => week([studyBlock]) as never })

    const reply = await handleIntent(command('today'), h.store, 1000)

    expect(reply?.text).toContain('Ethics essay')
  })

  it('says plainly when today had nothing on it', async () => {
    const h = harness({ loadWeek: async () => week() as never })

    expect((await handleIntent(command('today'), h.store, 1000))?.text).toMatch(/nothing/i)
  })

  it('answers /rest with one thing to do when something is low', async () => {
    const h = harness({ loadWeek: async () => week([], depleted) as never })

    const reply = await handleIntent(command('rest'), h.store, 1000)

    expect(reply?.buttons?.flat().filter((b) => b.data.startsWith('rest:accept'))).toHaveLength(1)
  })

  // Nothing to prescribe is the honest answer for a week that is going fine, and offering
  // rest anyway would make the advice worth ignoring when it does matter.
  it('offers nothing when no reserve is low enough to need it', async () => {
    const h = harness({ loadWeek: async () => week() as never })

    expect((await handleIntent(command('rest'), h.store, 1000))?.buttons).toBeUndefined()
  })

  it('asks which task when /stuck names none', async () => {
    const h = harness()

    expect((await handleIntent(command('stuck'), h.store, 1000))?.text).toMatch(/which|what/i)
  })

  /**
   * Matched against a real block rather than answered from the words alone: §4.1's first
   * move depends on what kind of work it is, and only the schedule knows that. It also
   * means this works with no key at all, which is CI, the demo, and most sessions.
   */
  it('answers /stuck with the first move for that block', async () => {
    const h = harness({ loadWeek: async () => week([studyBlock]) as never })

    const reply = await handleIntent(command('stuck', 'ethics'), h.store, 1000)

    expect(reply?.text).toMatch(/open the document/i)
    expect(reply?.text).toMatch(/\d+ minutes/)
  })

  it('matches the block however it was capitalised', async () => {
    const h = harness({ loadWeek: async () => week([studyBlock]) as never })

    expect((await handleIntent(command('stuck', 'ETHICS ESSAY'), h.store, 1000))?.text.length)
      .toBeGreaterThan(0)
  })

  // Said plainly rather than inventing a first move for something that is not in the week.
  it('says so when the task is not in the week', async () => {
    const h = harness({ loadWeek: async () => week([studyBlock]) as never })

    const reply = await handleIntent(command('stuck', 'quantum mechanics'), h.store, 1000)

    expect(reply?.text).toMatch(/cannot find|\/today/i)
  })

  // Every new flow refuses an unlinked chat, and writes nothing for one.
  it.each(['help', 'today', 'yesterday', 'rest', 'stuck'])(
    'refuses /%s for an unlinked chat, and writes nothing',
    async (name) => {
      const h = harness({ accountForChat: async () => null })

      const reply = await handleIntent(command(name, 'x'), h.store, 1000)

      expect(reply?.text).toMatch(/not linked/i)
      expect(h.saved).toEqual([])
    },
  )
})

describe('answering a block', () => {
  const answer = (
    blockId = 'b1',
    value: BlockAnswerInput['answer'] = 'right',
    rest: Partial<BlockAnswerInput> = {},
  ) =>
    ({
      kind: 'blockAnswer',
      chatId: 7,
      blockId,
      type: 'mental',
      plannedHours: 2,
      dayIndex: 1,
      answer: value,
      ...rest,
    }) as never

  // §8b②: the record carries what `outcomesFrom` needs -- type and planned hours -- taken
  // from the week the bot already loaded, not just the answer and an id nothing can join.
  it('records the answer with the block\'s type, planned hours and day index', async () => {
    const h = harness()

    await handleIntent(answer('b1', 'right'), h.store, 1000)

    expect(h.blockAnswers).toEqual([
      { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 1, answer: 'right' },
    ])
  })

  it.each(['didnt', 'less', 'right', 'longer'] as const)('records a "%s" answer', async (value) => {
    const h = harness()

    await handleIntent(answer('b1', value), h.store, 1000)

    expect(h.blockAnswers[0]?.answer).toBe(value)
  })

  /**
   * §7.9's never punish a miss. A student who did not do the thing is exactly the one whose
   * data is most worth having, and a comment on it is how they stop answering.
   */
  it('answers a miss with no comment at all', async () => {
    const h = harness()

    const reply = await handleIntent(answer('b1', 'didnt'), h.store, 1000)

    expect(reply?.text).not.toMatch(/sorry|shame|tomorrow|better|why|should/i)
  })

  // The week is evidence for §2.4 and §6.6, which do not exist yet. A check-in that quietly
  // edited the schedule would be acting on data nobody has validated.
  it('changes nothing about the week', async () => {
    const h = harness()

    await handleIntent(answer(), h.store, 1000)

    expect(h.saved).toEqual([])
  })

  it('records nothing for an unlinked chat', async () => {
    const h = harness({ accountForChat: async () => null })

    await handleIntent(answer(), h.store, 1000)

    expect(h.blockAnswers).toEqual([])
  })
})

/**
 * Task 17b's central assertion: the bot and the today card must produce identical evidence
 * for identical facts. Two writers and two stores were never one loop until this held --
 * `grep block_answers` used to find exactly one hit, the line that wrote it, and nothing
 * ever read it back.
 *
 * This does not merely check that both paths produce *something*. It drives the actual
 * button (`blocksReply`) through the actual parser (`readUpdate`) through `handleIntent`,
 * captures the record `recordBlockAnswer` was actually called with, and compares the
 * `BlockOutcome` `outcomesFrom` derives from it against the `BlockOutcome` derived from a
 * `BlockRecord` built the way the today card builds one -- real values, through the real
 * function both readers use.
 */
describe('the bot and the card produce the same outcome', () => {
  it('turns a callback answer into the same BlockOutcome the today card would have written', async () => {
    const block = {
      id: 'b1',
      title: 'Ethics essay',
      startHour: 9,
      type: 'mental' as const,
      hours: 3,
      dayIndex: 2,
    }

    // The bot's own path: the exact buttons /yesterday would send, and the exact callback
    // Telegram sends back for a press on "Took longer".
    const reply = blocksReply('yesterday', [block])
    const pressed = reply.buttons?.flat().find((button) => button.label === 'Took longer')
    if (pressed === undefined) throw new Error('no "Took longer" button was offered')

    const intent = readUpdate({
      callback_query: { message: { chat: { id: 4242 } }, data: pressed.data },
    })

    const h = harness()
    await handleIntent(intent, h.store, 5000)

    const captured = h.blockAnswers[0]
    if (captured === undefined) throw new Error('nothing was recorded')

    const fromBot: BlockRecord = { ...captured, answeredAt: 5000 }

    // The card's own path: the same block, answered the same way, in the shape
    // `checkIn.ts` and the Supabase repository already write today for the today card.
    const fromCard: BlockRecord = {
      blockId: block.id,
      type: block.type,
      plannedHours: block.hours,
      dayIndex: block.dayIndex,
      answer: 'longer',
      answeredAt: 5000,
    }

    expect(fromBot).toEqual(fromCard)
    expect(outcomesFrom([fromBot])).toEqual(outcomesFrom([fromCard]))
  })
})

describe('answering a rest suggestion', () => {
  const restAnswer = (accepted: boolean, startHour: number | null = 15) =>
    ({ kind: 'restAnswer', chatId: 7, startHour, accepted }) as never

  const lowWeek = () => ({
    items: [],
    start: { mental: 20, physical: 70, social: 70, errands: 70 },
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  })

  it('adds protected rest to the week when accepted', async () => {
    const h = harness({ loadWeek: async () => lowWeek() as never })

    await handleIntent(restAnswer(true), h.store, 1000)

    expect(h.saved).toHaveLength(1)
    const added = h.saved[0]?.items.at(-1)
    expect(added?.protectedRest).toBe(true)
  })

  // §5.1: the optimizer cannot move protected rest, and cannot schedule over it either.
  // Rest it can move to fit work in is not protected at all.
  it('adds it as fixed, so the optimizer cannot move it', async () => {
    const h = harness({ loadWeek: async () => lowWeek() as never })

    await handleIntent(restAnswer(true), h.store, 1000)

    expect(h.saved[0]?.items.at(-1)?.fixed).toBe(true)
  })

  it('writes nothing when declined', async () => {
    const h = harness()

    await handleIntent(restAnswer(false, null), h.store, 1000)

    expect(h.saved).toEqual([])
  })

  it('writes nothing for an unlinked chat', async () => {
    const h = harness({ accountForChat: async () => null })

    await handleIntent(restAnswer(true), h.store, 1000)

    expect(h.saved).toEqual([])
  })
})

describe('pricing a request', () => {
  const ask = (argument: string) =>
    ({ kind: 'command', chatId: 7, name: 'ask', argument }) as never

  const priced = {
    cost: {
      firstDeficitDayBefore: 21,
      firstDeficitDayAfter: 14,
      eveningsEquivalent: 3,
    },
    drafts: [
      { tone: 'decline' as const, text: 'I cannot take this on.' },
      { tone: 'defer' as const, text: 'Could it wait?' },
      { tone: 'accept' as const, text: 'Yes, but the gym goes.' },
    ],
  }

  it('prices it and offers the three drafts', async () => {
    const h = harness()
    const priceAsk = vi.fn().mockResolvedValue(priced)

    const reply = await handleIntent(ask('cover my shift saturday'), h.store, 1000, { priceAsk })

    expect(priceAsk).toHaveBeenCalledOnce()
    expect(reply?.text).toContain('I cannot take this on.')
  })

  /**
   * §2.3: the app does the work of declining, the student keeps the decision. This is the
   * one place a bot could quietly take it, so there must be nothing to press.
   */
  it('offers nothing that could send the reply', async () => {
    const h = harness()
    const priceAsk = vi.fn().mockResolvedValue(priced)

    const reply = await handleIntent(ask('cover my shift'), h.store, 1000, { priceAsk })

    expect(reply?.buttons).toBeUndefined()
  })

  it('never writes the request into the week', async () => {
    const h = harness()
    const priceAsk = vi.fn().mockResolvedValue(priced)

    await handleIntent(ask('cover my shift'), h.store, 1000, { priceAsk })

    expect(h.saved).toEqual([])
  })

  it('asks what the request was when nothing followed the command', async () => {
    const h = harness()

    const reply = await handleIntent(ask(''), h.store, 1000, { priceAsk: vi.fn() })

    expect(reply?.text.length).toBeGreaterThan(0)
  })

  // Said plainly rather than priced as something invented.
  it('says so when the request could not be read', async () => {
    const h = harness()
    const priceAsk = vi.fn().mockResolvedValue(null)

    const reply = await handleIntent(ask('asdfghjkl'), h.store, 1000, { priceAsk })

    expect(reply?.text.length).toBeGreaterThan(0)
    expect(reply?.buttons).toBeUndefined()
  })

  it('says so rather than failing when pricing throws', async () => {
    const h = harness()
    const priceAsk = vi.fn().mockRejectedValue(new Error('down'))

    const reply = await handleIntent(ask('cover my shift'), h.store, 1000, { priceAsk })

    expect(reply?.text.length).toBeGreaterThan(0)
  })

  it('prices nothing for an unlinked chat', async () => {
    const h = harness({ accountForChat: async () => null })
    const priceAsk = vi.fn()

    await handleIntent(ask('cover my shift'), h.store, 1000, { priceAsk })

    expect(priceAsk).not.toHaveBeenCalled()
  })

  /**
   * Ruling 41. `/ask` priced against day 0 of the fortnight no matter what day it was, with
   * no check-in evidence at all -- while the app's own request box passed both. The same
   * question got two answers depending on which door it came through, and `todayFor` was
   * already in this file and already used by the `today` and `yesterday` branches.
   */
  it('prices against the day the student is actually on', async () => {
    const anchored = {
      ...week(),
      // Anchored three days before `now` below, so day 3 is the only correct answer and
      // day 0 -- what this branch used to imply -- is visibly wrong.
      startedOn: '2026-03-02',
    }
    const h = harness({ loadWeek: async () => anchored as never })
    const priceAsk = vi.fn().mockResolvedValue(priced)

    await handleIntent(
      ask('cover my shift'),
      h.store,
      Date.parse('2026-03-05T09:00:00Z'),
      { priceAsk },
    )

    expect(priceAsk).toHaveBeenCalledWith('cover my shift', anchored, 3, [])
  })

  // The evidence half. Without it the price is quoted against a fortnight assumed to be
  // fully checked in, which is the optimistic stand-in §6.5 exists to refuse.
  it('prices against the block log the account has actually written', async () => {
    const log: BlockRecord[] = [
      { blockId: 'b1', type: 'mental', plannedHours: 2, dayIndex: 0, answer: 'longer', answeredAt: 1 },
    ]
    const h = harness({ loadBlockLog: async () => log })
    const priceAsk = vi.fn().mockResolvedValue(priced)

    await handleIntent(ask('cover my shift'), h.store, 1000, { priceAsk })

    expect(priceAsk).toHaveBeenCalledWith('cover my shift', expect.anything(), 0, log)
  })

  // Ruling 42's shape: a block-log read that cannot reach its columns must be visible, not
  // swallowed into a price computed as though the student had never answered anything.
  it('says it cannot price rather than pricing on evidence it could not read', async () => {
    const h = harness({
      loadBlockLog: async () => {
        throw new Error('column "load_type" does not exist')
      },
    })
    const priceAsk = vi.fn().mockResolvedValue(priced)

    const reply = await handleIntent(ask('cover my shift'), h.store, 1000, { priceAsk })

    expect(priceAsk).not.toHaveBeenCalled()
    expect(reply?.text).toMatch(/cannot price/i)
  })
})

describe('a forwarded photo', () => {
  const photo = (bytes = 50_000) =>
    ({ kind: 'photo', chatId: 7, fileId: 'p1', bytes }) as never

  it('reads it and offers what it understood', async () => {
    const h = harness()
    const readPhotoFile = vi.fn().mockResolvedValue([parsed('Lecture')])

    const reply = await handleIntent(photo(), h.store, 1000, { readPhotoFile })

    expect(readPhotoFile).toHaveBeenCalledOnce()
    expect(reply?.buttons).toBeDefined()
  })

  it('stores it as pending rather than writing it', async () => {
    const h = harness()
    const readPhotoFile = vi.fn().mockResolvedValue([parsed('Lecture')])

    await handleIntent(photo(), h.store, 1000, { readPhotoFile })

    expect(h.pendings).toHaveLength(1)
    expect(h.saved).toEqual([])
  })

  // The chat enforces exactly the app's limit, and refuses before the model is called so an
  // oversized image cannot cost a request.
  it('refuses one larger than the app allows, without reading it', async () => {
    const h = harness()
    const readPhotoFile = vi.fn()

    const reply = await handleIntent(photo(99_000_000), h.store, 1000, { readPhotoFile })

    expect(readPhotoFile).not.toHaveBeenCalled()
    expect(reply?.text.length).toBeGreaterThan(0)
  })

  // Unlike the planner, reading an image genuinely needs the model. §1.4's own stance: say
  // so plainly rather than pretend a fallback exists.
  it('says so plainly when it cannot read images at all', async () => {
    const h = harness()

    const reply = await handleIntent(photo(), h.store, 1000)

    expect(reply?.text.length).toBeGreaterThan(0)
    expect(h.pendings).toEqual([])
  })

  it('says so when nothing was understood, with nothing to press', async () => {
    const h = harness()
    const readPhotoFile = vi.fn().mockResolvedValue([])

    const reply = await handleIntent(photo(), h.store, 1000, { readPhotoFile })

    expect(reply?.buttons).toBeUndefined()
  })

  it('reads nothing for an unlinked chat', async () => {
    const h = harness({ accountForChat: async () => null })
    const readPhotoFile = vi.fn()

    await handleIntent(photo(), h.store, 1000, { readPhotoFile })

    expect(readPhotoFile).not.toHaveBeenCalled()
  })
})

describe('a voice note', () => {
  const voice = (seconds = 20, bytes = 30_000) =>
    ({ kind: 'voice', chatId: 7, fileId: 'v1', seconds, bytes }) as never

  it('transcribes it and treats it as a brain dump', async () => {
    const h = harness()
    const transcribe = vi.fn().mockResolvedValue('essay due friday and gym')

    const reply = await handleIntent(voice(), h.store, 1000, { transcribe })

    expect(transcribe).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenCalledWith('essay due friday and gym')
    expect(reply?.buttons).toBeDefined()
  })

  // Refused before transcription, so a long recording cannot cost a request.
  it('refuses a recording longer than it can read, without transcribing', async () => {
    const h = harness()
    const transcribe = vi.fn()

    const reply = await handleIntent(voice(60 * 30), h.store, 1000, { transcribe })

    expect(transcribe).not.toHaveBeenCalled()
    expect(reply?.text).toMatch(/shorter|type/i)
  })

  // The state CI and the demo run in. Told plainly to type instead, rather than silence.
  it('says to type instead when it cannot listen', async () => {
    const h = harness()

    const reply = await handleIntent(voice(), h.store, 1000)

    expect(reply?.text).toMatch(/type/i)
    expect(parse).not.toHaveBeenCalled()
  })

  it('says so rather than failing when transcription throws', async () => {
    const h = harness()
    const transcribe = vi.fn().mockRejectedValue(new Error('down'))

    const reply = await handleIntent(voice(), h.store, 1000, { transcribe })

    expect(reply?.text.length).toBeGreaterThan(0)
  })

  it('treats silence as nothing understood rather than an empty dump', async () => {
    const h = harness()
    const transcribe = vi.fn().mockResolvedValue('   ')

    const reply = await handleIntent(voice(), h.store, 1000, { transcribe })

    expect(reply?.buttons).toBeUndefined()
    expect(h.pendings).toEqual([])
  })

  it('transcribes nothing for an unlinked chat', async () => {
    const h = harness({ accountForChat: async () => null })
    const transcribe = vi.fn()

    await handleIntent(voice(), h.store, 1000, { transcribe })

    expect(transcribe).not.toHaveBeenCalled()
  })
})

describe('the flows when their service is absent', () => {
  // Every one of these is the state CI, the demo, and any deployment before its keys are
  // filled in. None may throw, and none may leave a message unanswered.
  const week = () => ({
    items: [],
    start: { mental: 20, physical: 70, social: 70, errands: 70 },
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  })

  it('says it cannot price a request with no pricing service', async () => {
    const h = harness()

    const reply = await handleIntent(
      { kind: 'command', chatId: 7, name: 'ask', argument: 'cover my shift' } as never,
      h.store,
      1000,
    )

    expect(reply?.text.length).toBeGreaterThan(0)
    expect(reply?.buttons).toBeUndefined()
  })

  it('says so when a photo could not be read', async () => {
    const h = harness()
    const readPhotoFile = vi.fn().mockResolvedValue(null)

    const reply = await handleIntent(
      { kind: 'photo', chatId: 7, fileId: 'p', bytes: 100 } as never,
      h.store,
      1000,
      { readPhotoFile },
    )

    expect(reply?.text.length).toBeGreaterThan(0)
    expect(h.pendings).toEqual([])
  })

  it('refuses a transcription longer than the planner accepts', async () => {
    const h = harness()
    const transcribe = vi.fn().mockResolvedValue('x'.repeat(5000))

    const reply = await handleIntent(
      { kind: 'voice', chatId: 7, fileId: 'v', seconds: 20, bytes: 100 } as never,
      h.store,
      1000,
      { transcribe },
    )

    expect(reply?.text).toMatch(/shorter|too long|split/i)
    expect(h.pendings).toEqual([])
  })

  // Accepting a suggestion that is no longer warranted -- the week changed between the
  // offer and the press -- must not invent one.
  it('does not invent a rest block when nothing is low any more', async () => {
    const h = harness()

    await handleIntent(
      { kind: 'restAnswer', chatId: 7, startHour: 16, accepted: true } as never,
      h.store,
      1000,
    )

    expect(h.saved).toEqual([])
  })

  it('still answers when the week is low and the press is honoured', async () => {
    const h = harness({ loadWeek: async () => week() as never })

    const reply = await handleIntent(
      { kind: 'restAnswer', chatId: 7, startHour: 16, accepted: true } as never,
      h.store,
      1000,
    )

    expect(reply?.text.length).toBeGreaterThan(0)
  })
})

// The photo reader throwing is a different path from it returning null, and only one of
// them was covered. Both end the same way for the student, which is the point.
it('says so rather than failing when reading a photo throws', async () => {
  const h = harness()
  const readPhotoFile = vi.fn().mockRejectedValue(new Error('network down'))

  const reply = await handleIntent(
    { kind: 'photo', chatId: 7, fileId: 'p', bytes: 100 } as never,
    h.store,
    1000,
    { readPhotoFile },
  )

  expect(reply?.text.length).toBeGreaterThan(0)
  expect(h.pendings).toEqual([])
})

/**
 * §7.9's retroactive fill, unblocked.
 *
 * This was answered with "I do not keep past days" until the week gained a real date
 * (`startedOn`). With an anchor there is a genuine yesterday to look up, so the flow the
 * spec asked for is finally the flow that runs.
 */
describe('looking back at yesterday', () => {
  const anchoredWeek = (startedOn: string | undefined, items: unknown[] = []) => ({
    items,
    start: { mental: 70, physical: 70, social: 70, errands: 70 },
    horizonDays: HORIZON_DAYS,
    sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    ...(startedOn === undefined ? {} : { startedOn }),
  })

  const blockOn = (dayIndex: number, title: string) => ({
    id: `b-${dayIndex}`, title, type: 'mental', kind: 'studyBlock', hours: 2,
    intensity: 1, dayIndex, startHour: 9, fixed: true, deadlineDay: null, protectedRest: false,
  })

  const yesterday = () => ({ kind: 'command', chatId: 7, name: 'yesterday', argument: '' }) as never
  const today = () => ({ kind: 'command', chatId: 7, name: 'today', argument: '' }) as never

  // Day 0 is the anchor date, so on the third day of a week yesterday is day 1.
  const startedThreeDaysAgo = '2026-09-07'
  const nowOnDayTwo = Date.parse('2026-09-09T12:00:00Z')

  it('lists what was scheduled the day before', async () => {
    const week = anchoredWeek(startedThreeDaysAgo, [
      blockOn(1, 'Yesterday lecture'),
      blockOn(2, 'Today seminar'),
    ])
    const h = harness({ loadWeek: async () => week as never })

    const reply = await handleIntent(yesterday(), h.store, nowOnDayTwo)

    expect(reply?.text).toContain('Yesterday lecture')
    expect(reply?.text).not.toContain('Today seminar')
  })

  it('reads today from the anchor too, not from a fixed day zero', async () => {
    const week = anchoredWeek(startedThreeDaysAgo, [
      blockOn(1, 'Yesterday lecture'),
      blockOn(2, 'Today seminar'),
    ])
    const h = harness({ loadWeek: async () => week as never })

    const reply = await handleIntent(today(), h.store, nowOnDayTwo)

    expect(reply?.text).toContain('Today seminar')
    expect(reply?.text).not.toContain('Yesterday lecture')
  })

  // A week saved before anchoring existed has no date to count from, and inventing one
  // would answer with somebody else's day.
  it('says it cannot look back when the week has no date', async () => {
    const h = harness({ loadWeek: async () => anchoredWeek(undefined) as never })

    const reply = await handleIntent(yesterday(), h.store, nowOnDayTwo)

    expect(reply?.text).toMatch(/does not go back|nothing to look at/i)
  })

  // On the first day of a week, yesterday is before the week began.
  it('says so when yesterday falls before the week started', async () => {
    const h = harness({ loadWeek: async () => anchoredWeek('2026-09-09') as never })

    const reply = await handleIntent(yesterday(), h.store, nowOnDayTwo)

    expect(reply?.text).toMatch(/does not go back|nothing to look at/i)
  })

  it('says plainly when yesterday had nothing on it', async () => {
    const h = harness({ loadWeek: async () => anchoredWeek(startedThreeDaysAgo) as never })

    expect((await handleIntent(yesterday(), h.store, nowOnDayTwo))?.text).toMatch(/nothing/i)
  })
})
