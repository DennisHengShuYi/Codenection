import { z } from 'zod'
import type { Draft, Tone } from './draftTemplates'

/** The order the student is offered them: refuse, postpone, accept. Fixed so the three
 *  choices sit in the same places every time rather than shuffling with the model's mood. */
const TONES = ['decline', 'defer', 'accept'] as const

/** Long enough for a real message, short enough that a runaway generation cannot fill the
 *  box. A decline that runs to three thousand characters is not a decline. */
const MAX_DRAFT_LENGTH = 1200

/**
 * The same boundary the planner's schema guards, applied to drafted text.
 *
 * A reply is not trusted for having passed through our own server, and this one goes
 * straight into a box the student may copy and send without rereading -- so a malformed or
 * incomplete set is rejected outright rather than partially shown.
 */
const replySchema = z.object({
  drafts: z
    .array(
      z.object({
        tone: z.enum(TONES),
        text: z.string().trim().min(1).max(MAX_DRAFT_LENGTH),
      }),
    )
    .length(TONES.length),
})

/** The planner's schema needed exactly this, for the same reason: the wrapper is our
 *  request, and dropping it is the most common way a model deviates. Nothing inside is
 *  relaxed -- an invented tone or a missing third draft is refused either way. */
const withWrapper = (raw: unknown): unknown => (Array.isArray(raw) ? { drafts: raw } : raw)

export function parseDraftReply(raw: unknown): Draft[] | null {
  const result = replySchema.safeParse(withWrapper(raw))
  if (!result.success) return null

  const byTone = new Map<Tone, Draft>()
  for (const draft of result.data.drafts) byTone.set(draft.tone, draft)

  // All three, each exactly once. A reply with "decline" twice would otherwise leave the
  // student without the defer option §2.3 promised them, and nothing downstream would
  // notice the gap.
  if (byTone.size !== TONES.length) return null

  return TONES.map((tone) => byTone.get(tone)).filter((draft): draft is Draft => draft !== undefined)
}
