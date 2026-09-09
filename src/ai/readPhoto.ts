import { readImageFile } from './image'
import { parseModelReply } from './schema'
import type { PhotoOutcome } from './types'

/**
 * Why there is no fallback here, stated once so nobody adds one later thinking it was an
 * oversight.
 *
 * The planner degrades to a rule-based parser because text can be read by rules. An image
 * cannot. Any "fallback" for a photograph would have to invent tasks that are not in the
 * picture, which is the exact failure §1.4's never-import-silently rule exists to prevent
 * -- and worse than having no feature, because it is wrong in a way the student cannot see.
 *
 * So the honest answer is a sentence, and it points at the typing path, which always works.
 */
const UNAVAILABLE =
  'I could not read that photo. Reading photos needs the model to be set up — you can type it out instead, which always works.'

export async function readPhoto(file: File): Promise<PhotoOutcome> {
  const image = await readImageFile(file)
  if (!image.ok) return { ok: false, reason: image.reason }

  try {
    const response = await fetch('/api/read-photo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: image.dataUrl }),
    })

    if (response.ok) {
      const items = parseModelReply(await response.json())
      // A reply that fails validation is a failure, not an empty week: telling a student
      // their brief contained nothing would be a lie they would act on.
      if (items !== null) return { ok: true, items }
    }
  } catch {
    // No endpoint, or no network. The same sentence either way -- a student cannot act on
    // the difference, and a stack trace in the interface helps nobody.
  }

  return { ok: false, reason: UNAVAILABLE }
}
