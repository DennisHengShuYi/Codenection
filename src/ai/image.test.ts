import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, readImageFile } from './image'

const fileOf = (bytes: number, type = 'image/jpeg', name = 'brief.jpg'): File =>
  new File([new Uint8Array(bytes)], name, { type })

/**
 * Checked in the browser before anything is uploaded. The endpoint checks again -- a
 * browser check is a courtesy, not a boundary -- but an image refused only at the server
 * has already been sent in full on a student's mobile data, and §10 budgets the whole
 * interaction rather than the model's half of it.
 */
describe('readImageFile', () => {
  it('turns a photo into something sendable', async () => {
    const result = await readImageFile(fileOf(64))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('refuses an image too large to send, and says so in words', async () => {
    const result = await readImageFile(fileOf(MAX_IMAGE_BYTES + 1))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/too (big|large)/i)
  })

  // Both sides of the boundary: an off-by-one here either refuses valid photos or pays for
  // uploads that cannot succeed.
  it('accepts one exactly at the limit', async () => {
    expect((await readImageFile(fileOf(MAX_IMAGE_BYTES))).ok).toBe(true)
  })

  it('refuses something that is not an image', async () => {
    const result = await readImageFile(fileOf(64, 'application/pdf', 'brief.pdf'))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/photo|image/i)
  })

  // HEIC especially: iPhones default to it, and leaving it out would refuse the most
  // common camera in the room.
  it('accepts what a phone camera actually produces', async () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic']) {
      expect((await readImageFile(fileOf(64, type))).ok, type).toBe(true)
    }
  })

  it('refuses an empty file rather than sending nothing', async () => {
    expect((await readImageFile(fileOf(0))).ok).toBe(false)
  })

  it('explains every refusal in a sentence rather than a code', async () => {
    const refusals = [fileOf(0), fileOf(64, 'application/pdf'), fileOf(MAX_IMAGE_BYTES + 1)]

    for (const file of refusals) {
      const result = await readImageFile(file)

      expect(result.ok).toBe(false)
      // A student cannot act on "ERR_TYPE". §1.4's stance applies to an import that never
      // started as much as to one that read the wrong date.
      if (!result.ok) expect(result.reason).toMatch(/^[A-Z].*[.!]$/)
    }
  })
})
