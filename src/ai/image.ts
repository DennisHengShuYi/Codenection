import { ACCEPTED_TYPES, MAX_IMAGE_BYTES } from './types'

export { ACCEPTED_TYPES, MAX_IMAGE_BYTES }

export type ImageResult =
  | { readonly ok: true; readonly dataUrl: string }
  | { readonly ok: false; readonly reason: string }

const isAccepted = (type: string): boolean =>
  (ACCEPTED_TYPES as readonly string[]).includes(type)

/**
 * Turns a chosen file into something sendable, and refuses what it should not accept.
 *
 * Every refusal is a sentence a student can act on rather than a code. §1.4's whole stance
 * is that a student cannot correct what they were never told, and that applies to an import
 * that never started just as much as to one that read the wrong date.
 */
export async function readImageFile(file: File): Promise<ImageResult> {
  if (!isAccepted(file.type)) {
    return { ok: false, reason: 'That does not look like a photo. Try a JPEG, PNG or HEIC.' }
  }

  if (file.size === 0) {
    return { ok: false, reason: 'That file is empty.' }
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'That photo is too big to send. Try a smaller one.' }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('unreadable'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })

  return { ok: true, dataUrl }
}
