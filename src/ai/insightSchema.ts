import { z } from 'zod'

/** One line of the sheet's insight block. Longer than this is a paragraph, and the block is
 *  a breakdown rather than an essay. */
export const MAX_INSIGHT_LINE = 200

/** The most facts this block ever carries: four reserves, the forecast, and one action. */
export const MAX_INSIGHT_LINES = 8

const replySchema = z.object({
  lines: z
    .array(z.string().trim().min(1).max(MAX_INSIGHT_LINE))
    .min(1)
    .max(MAX_INSIGHT_LINES),
})

/** The wrapper is our request, and dropping it is the most common way a model deviates.
 *  Nothing inside is relaxed by allowing it. */
const withWrapper = (raw: unknown): unknown => (Array.isArray(raw) ? { lines: raw } : raw)

/**
 * The boundary that keeps this from becoming the model's opinion of somebody's fortnight.
 *
 * The facts are computed in `domain/reserveInsight` and the model is asked only to rephrase
 * them, one line for one line. The count check is what makes that more than a request: a
 * reply with a line added has invented a claim, and a reply with a line dropped has quietly
 * deleted a warning. Either way the mapping back to the numbers is broken, so neither is
 * repaired -- the whole reply is refused and the computed wording stands.
 *
 * §8.2 is the rule underneath: the app may never describe a week the model did not
 * simulate. A language model writing its own sentence about a student's reserves is exactly
 * that, however plausible the sentence.
 */
export function parseInsightReply(raw: unknown, expected: number): readonly string[] | null {
  const result = replySchema.safeParse(withWrapper(raw))
  if (!result.success) return null
  if (result.data.lines.length !== expected) return null

  return result.data.lines
}
