import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hasTelegramLink, requestLinkCode, unlinkTelegram } from './telegramLinks'

const stub = {
  calls: [] as Array<{ name: string; args: unknown }>,
  result: {} as { data?: unknown; error?: { message: string } | null },
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
    rpc: (name: string, args: unknown) => {
      stub.calls.push({ name, args })
      return Promise.resolve(stub.result)
    },
  }),
}))

vi.mock('./env', () => ({
  readDataConfig: () => ({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-key',
    telegramBot: 'codenection_bot',
  }),
}))

beforeEach(() => {
  stub.calls = []
  stub.result = { data: null, error: null }
})

describe('requestLinkCode', () => {
  it('asks the database to issue a code and returns it', async () => {
    const result = await requestLinkCode()

    expect(result.ok).toBe(true)
    expect(result.ok === true && result.code.length).toBeGreaterThanOrEqual(8)
    expect(stub.calls[0]?.name).toBe('issue_telegram_link_code')
  })

  /**
   * The code is made here and sent to the database, rather than the database making one and
   * sending it back. It has to reach the student either way, and generating it client-side
   * keeps the database function to a single insert with nothing to return.
   */
  it('sends the same code it shows the student', async () => {
    const result = await requestLinkCode()

    const sent = (stub.calls[0]?.args as { new_code: string }).new_code
    expect(result.ok === true && result.code).toBe(sent)
  })

  // Tapping the link is the whole point: nobody should have to retype a code onto a phone.
  it('returns a link that opens the bot with the code already in it', async () => {
    const result = await requestLinkCode()

    expect(result.ok === true && result.url).toBe(
      `https://t.me/codenection_bot?start=${result.ok === true ? result.code : ''}`,
    )
  })

  it('reports a database failure in words rather than throwing', async () => {
    stub.result = { error: { message: 'not signed in' } }

    const result = await requestLinkCode()

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message.length).toBeGreaterThan(0)
  })

  it('reports a thrown failure rather than letting it escape', async () => {
    stub.result = { get error(): never {
      throw new Error('network down')
    } }

    const result = await requestLinkCode()

    expect(result.ok).toBe(false)
  })
})

describe('unlinkTelegram', () => {
  it('asks the database to unlink', async () => {
    const result = await unlinkTelegram()

    expect(result.ok).toBe(true)
    expect(stub.calls[0]?.name).toBe('unlink_telegram')
  })

  // Unlinking when nothing is linked leaves the desired state in place. A student should
  // never be told off for asking for something that is already true.
  it('treats unlinking nothing as success', async () => {
    stub.result = { data: null, error: null }

    expect((await unlinkTelegram()).ok).toBe(true)
  })

  it('reports a failure rather than throwing', async () => {
    stub.result = { error: { message: 'not signed in' } }

    expect((await unlinkTelegram()).ok).toBe(false)
  })
})

describe('hasTelegramLink', () => {
  it('reports a linked chat', async () => {
    stub.result = { data: true, error: null }

    expect(await hasTelegramLink()).toBe(true)
  })

  it('reports no linked chat', async () => {
    stub.result = { data: false, error: null }

    expect(await hasTelegramLink()).toBe(false)
  })

  // A blip must not make the app claim a chat is linked when it cannot tell. Not-linked is
  // the honest answer, and the recoverable one: the student can link again.
  it('answers no rather than throwing when it cannot tell', async () => {
    stub.result = { error: { message: 'network down' } }

    expect(await hasTelegramLink()).toBe(false)
  })
})

describe('when the call itself fails', () => {
  // None of these may throw into the UI: the panel shows a message and stays usable.
  it('reports a thrown failure when unlinking', async () => {
    stub.result = { get error(): never {
      throw new Error('network down')
    } }

    expect((await unlinkTelegram()).ok).toBe(false)
  })

  it('answers no rather than throwing when the link check fails', async () => {
    stub.result = { get data(): never {
      throw new Error('network down')
    } }

    expect(await hasTelegramLink()).toBe(false)
  })
})
