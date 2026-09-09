import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPhoto } from './readPhoto'

const photo = (bytes = 64, type = 'image/jpeg') =>
  new File([new Uint8Array(bytes)], 'brief.jpg', { type })

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('readPhoto', () => {
  it('returns what the model read', async () => {
    respondWith(200, {
      items: [{ title: 'WIA3001 report', type: 'mental', hours: 8, deadlineDay: 9, hard: true }],
    })

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.items[0]?.title).toBe('WIA3001 report')
  })

  /**
   * The design decision this module exists for. A photograph has no honest rule-based
   * fallback -- reading an image needs the model, and guessing at contents would mean
   * inventing tasks that are not in the picture. So the answer is a sentence, and it points
   * at the path that always works.
   */
  it('says plainly that reading a photo needs the model when none is configured', async () => {
    respondWith(503, {})

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.reason).toMatch(/photo/i)
      // Points somewhere useful rather than leaving the student stuck.
      expect(outcome.reason).toMatch(/typ/i)
    }
  })

  it('says so when the network fails, without leaking a technical error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(false)
    // A stack trace in the interface is the failure this guards against.
    if (!outcome.ok) expect(outcome.reason).not.toMatch(/fetch|undefined|error:/i)
  })

  it('passes a refusal from the file check straight through, without an upload', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const outcome = await readPhoto(photo(64, 'application/pdf'))

    expect(outcome.ok).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  // Telling a student their brief contained nothing would be a lie they would act on.
  it('treats a reply it cannot validate as a failure, not as an empty week', async () => {
    respondWith(200, { items: [{ title: 'x', type: 'invented' }] })

    expect((await readPhoto(photo())).ok).toBe(false)
  })

  // A photo of a blank wall. Nothing found is a real answer, and different from a failure.
  it('reports finding nothing as a success with nothing in it', async () => {
    respondWith(200, { items: [] })

    const outcome = await readPhoto(photo())

    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.items).toEqual([])
  })
})
