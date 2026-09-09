import { afterEach, describe, expect, it, vi } from 'vitest'
import { readRequest } from './readRequest'

/**
 * The endpoint is stubbed unreachable throughout, so every case runs the rule-based path --
 * which is what CI and a key-less machine use. Nothing here can reach a live model.
 */
const offline = () => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint')))

afterEach(() => vi.unstubAllGlobals())

describe('readRequest', () => {
  it('turns a pasted request into one proposed commitment', async () => {
    offline()

    const item = await readRequest('can you help with our group meeting on thursday')

    expect(item?.title.toLowerCase()).toContain('meeting')
    expect(item?.type).toBe('social')
  })

  it('reads a stated effort', async () => {
    offline()

    expect((await readRequest('cover my shift, 3 hours'))?.hours).toBe(3)
  })

  it('reads a stated day', async () => {
    offline()

    expect((await readRequest('help with the essay by friday'))?.deadlineDay).not.toBeNull()
  })

  // A message that mentions three things is still one ask, and the student corrects it on
  // the chip before being priced on it.
  it('takes a single commitment even when the message rambles', async () => {
    offline()

    expect(await readRequest('hey, so, gym later, but also can you cover my shift')).not.toBeNull()
  })

  it('returns nothing for an empty request', async () => {
    offline()

    expect(await readRequest('   ')).toBeNull()
  })

  it('returns nothing for something far longer than a request', async () => {
    offline()

    expect(await readRequest('x'.repeat(5000))).toBeNull()
  })

  it('returns nothing when there is nothing in the message to act on', async () => {
    offline()

    expect(await readRequest(',,,')).toBeNull()
  })
})
