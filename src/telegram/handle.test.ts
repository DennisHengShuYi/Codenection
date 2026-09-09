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
  pendings: PendingDump[]
  answered: string[]
  linked: Array<{ chatId: number; accountId: string }>
}

function harness(over: Partial<ChatStore> = {}): Harness {
  const saved: Schedule[] = []
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
    ...over,
  }

  return { store, saved, pendings, answered, linked }
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
