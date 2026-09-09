import { z } from 'zod'
import { BLOCK_KINDS, HORIZON_DAYS, LOAD_TYPES } from '../engine'
import { MAX_ITEMS, type ParsedItem } from './types'

/**
 * The boundary .claude/CLAUDE.md names.
 *
 * A model reply is not trusted for having passed through our own server. This is the one
 * place it becomes data, and a load type the model invented would corrupt every projection
 * from here on -- so the enum is the engine's own list rather than a copy that could drift
 * away from it.
 *
 * `kind` is `BLOCK_KINDS`, not `ACTIVITY_KINDS`: `sleep` is an activity but not a block, and
 * the boundary admitting one the picker had already stopped offering is exactly the shape
 * this rule exists to refuse (Ruling 46).
 */
const replySchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        type: z.enum(LOAD_TYPES),
        kind: z.enum(BLOCK_KINDS),
        hours: z.number().positive().max(24),
        deadlineDay: z
          .number()
          .int()
          .min(0)
          .max(HORIZON_DAYS - 1)
          .nullable(),
        hard: z.boolean(),
      }),
    )
    .max(MAX_ITEMS),
})

let counter = 0

const nextId = (): string => {
  counter += 1
  return `parsed-${counter}`
}

/**
 * The wrapper is our request; the item contents are the boundary.
 *
 * Models drop `{"items":...}` and answer with the array on its own -- observed from the
 * vision model on a photographed timetable, where every item was well-formed and the whole
 * import was discarded over the shape around them. Accepting both costs nothing that
 * matters: every item still goes through the schema above unchanged, so an invented load
 * type or an absurd hours figure is refused in an array exactly as in an object.
 */
const withWrapper = (raw: unknown): unknown => (Array.isArray(raw) ? { items: raw } : raw)

/**
 * Null rather than throwing: a malformed reply is an expected outcome that falls back to
 * the rule-based parser, not an exceptional one.
 */
export function parseModelReply(raw: unknown): ParsedItem[] | null {
  const result = replySchema.safeParse(withWrapper(raw))
  if (!result.success) return null

  return result.data.items.map((item) => ({
    id: nextId(),
    ...item,
    // Everything from the model is a proposal. §3.2: nothing enters unconfirmed.
    confident: false,
  }))
}
