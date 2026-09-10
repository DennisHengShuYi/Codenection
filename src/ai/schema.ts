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
        /**
         * Whether the model actually read this row, or reconstructed it.
         *
         * Defaulted rather than required, in the cautious direction: a reply that omits it
         * is one that never claimed certainty, and `parseModelReply` is all-or-nothing, so
         * requiring it would let one missing field discard every other item in the reply.
         */
        confident: z.boolean().default(false),
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
 * Null rather than throwing: a malformed reply is an expected outcome that falls back to
 * the rule-based parser, not an exceptional one.
 */
export function parseModelReply(raw: unknown): ParsedItem[] | null {
  const result = replySchema.safeParse(raw)
  if (!result.success) return null

  return result.data.items.map(({ hard, ...item }) => ({
    id: nextId(),
    ...item,
    // `hard` is the model's word on the wire; `fixed` is the domain's. Mapped here rather
    // than carried through under two names, because what the model is asserting -- "a
    // fixed time was printed on the page" -- is a *proposal* for the chip's checkbox, and
    // the student's accept is what turns it into a pinned block.
    fixed: hard,
    // `confident` is the model's own word on whether it read this row or reconstructed it,
    // and it is carried through rather than overwritten. It used to be hardcoded `false`,
    // which meant `ItemChip`'s "not sure about this one" fired on every row of every
    // import -- a warning that is always on carries no information, and students learn to
    // tap past it. §3.2's "nothing enters unconfirmed" is unaffected: it is the accept
    // flow that enforces that, not this flag.
  }))
}
