import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedItem } from '../ai'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { handleIntent, type ChatStore } from './handle'
import type { PendingDump } from './brainDump'

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
  hours: 2,
  deadlineDay: null,
  hard: false,
  confident: true,
})

interface Harness {
  store: ChatStore
  saved: Schedule[]
  blockAnswers: Array<{ blockId: string; answer: string }>
  pendings: PendingDump[]
  answered: string[]
  linked: Array<{ chatId: number; accountId: string }>
}

function harness(over: Partial<ChatStore> = {}): Harness {
  const saved: Schedule[] = []
  const blockAnswers: Array<{ blockId: string; answer: string }> = []
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
    recordBlockAnswer: async (_accountId, blockId, answer) => {
      blockAnswers.push({ blockId, answer })
    },
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

  /**
   * The schedule carries no date, so there is no yesterday to look up. Answering with
   * today's blocks under yesterday's name would put wrong data into the very table §2.4
   * will later trust, so it says so instead.
   */
  it('says it cannot look back yet, rather than answering with today', async () => {
    const h = harness({ loadWeek: async () => week() as never })

    const reply = await handleIntent(command('yesterday'), h.store, 1000)

    expect(reply?.text).toMatch(/past days|look back/i)
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
  const answer = (blockId = 'b1', value: 'yes' | 'no' | 'partly' = 'yes') =>
    ({ kind: 'blockAnswer', chatId: 7, blockId, answer: value }) as never

  it('records the answer', async () => {
    const h = harness()

    await handleIntent(answer('b1', 'partly'), h.store, 1000)

    expect(h.blockAnswers).toEqual([{ blockId: 'b1', answer: 'partly' }])
  })

  /**
   * §7.9's never punish a miss. A student who did not do the thing is exactly the one whose
   * data is most worth having, and a comment on it is how they stop answering.
   */
  it('answers a miss with no comment at all', async () => {
    const h = harness()

    const reply = await handleIntent(answer('b1', 'no'), h.store, 1000)

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
