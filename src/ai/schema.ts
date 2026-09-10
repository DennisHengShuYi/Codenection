import { z } from 'zod'
import { ACTIVITY_KINDS, HORIZON_DAYS, LOAD_TYPES } from '../engine'
import { MAX_ITEMS, type ParsedItem } from './types'

/**
 * The boundary .claude/CLAUDE.md names.
 *
 * A model reply is not trusted for having passed through our own server. This is the one
 * place it becomes data, and a load type the model invented would corrupt every projection
 * from here on -- so the enum is the engine's own list rather than a copy that could drift
 * away from it.
 */
const replySchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        type: z.enum(LOAD_TYPES),
        kind: z.enum(ACTIVITY_KINDS),
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
 * Null rather than throwing: a malformed reply is an expected outcome that falls back to
 * the rule-based parser, not an exceptional one.
 */
export function parseModelReply(raw: unknown): ParsedItem[] | null {
  const result = replySchema.safeParse(raw)
  if (!result.success) return null

  return result.data.items.map((item) => ({
    id: nextId(),
    ...item,
    // Everything from the model is a proposal. §3.2: nothing enters unconfirmed.
    confident: false,
  }))
}
