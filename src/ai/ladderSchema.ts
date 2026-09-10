import { z } from 'zod'
import { MAX_ACTION_LENGTH, MAX_RUNG_MINUTES, MAX_RUNGS, MIN_RUNGS, type Rung } from '../domain/ladder'

/**
 * The same boundary the planner's and the drafter's schemas guard, applied to a chain.
 *
 * The bounds are not decoration. §4.1's time box is printed on screen beside the rung, so a
 * schema that admitted an eleven-minute step would have the app make a promise and break it
 * in the same sentence. The project rule is that untrusted input never becomes trusted by
 * passing through a layer -- and a reply is not trusted for having come back through our
 * own server.
 */
const replySchema = z.object({
  steps: z
    .array(
      z.object({
        action: z.string().trim().min(1).max(MAX_ACTION_LENGTH),
        minutes: z.number().int().positive().max(MAX_RUNG_MINUTES),
      }),
    )
    .min(MIN_RUNGS)
    .max(MAX_RUNGS),
})

/** The wrapper is our request, and dropping it is the most common way a model deviates.
 *  Nothing inside is relaxed by allowing it. */
const withWrapper = (raw: unknown): unknown => (Array.isArray(raw) ? { steps: raw } : raw)

/**
 * All-or-nothing, deliberately.
 *
 * A partially valid chain is a chain with a hole in it, and on a page that shows one rung at
 * a time the hole is invisible until the student reaches it -- at which point they are stuck
 * again, by the thing built to unstick them.
 */
export function parseLadderReply(raw: unknown): Rung[] | null {
  const result = replySchema.safeParse(withWrapper(raw))
  if (!result.success) return null

  return result.data.steps.map((step) => ({ action: step.action, minutes: step.minutes }))
}
