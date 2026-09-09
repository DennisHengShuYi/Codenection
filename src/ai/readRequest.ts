import { parseBrainDump } from './parseBrainDump'
import { MAX_REQUEST_LENGTH, type ParsedItem } from './types'

/**
 * Turns a pasted request into one proposed commitment.
 *
 * No new model call and no second parser: the say-anything planner already turns
 * unstructured text into exactly this shape, rule-based fallback included, so the request
 * box asks it for one thing instead of many.
 *
 * A second set of rules here would drift out of step with the planner's, and the drift
 * would show up as the request box reading a message differently from the planner reading
 * the same words.
 */
export async function readRequest(text: string): Promise<ParsedItem | null> {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed.length > MAX_REQUEST_LENGTH) return null

  const outcome = await parseBrainDump(trimmed)
  const [first, ...rest] = outcome.items
  if (!first) return null

  /**
   * The planner splits on commas, which is right for a brain dump and wrong for a request.
   * "Cover my shift, 3 hours" is one ask with its effort stated after a comma — read as a
   * list it becomes two items, and the effort is dropped from the one that matters, so the
   * student gets priced on a default of one hour for a three-hour shift.
   *
   * So the fragments are merged back into the single ask they came from: the longest one
   * carries the ask itself, and any effort or date stated anywhere in the message belongs
   * to it.
   */
  const items = [first, ...rest]

  const ask = items.reduce((longest, item) =>
    item.title.length > longest.title.length ? item : longest,
  )

  const hours = items.reduce((most, item) => Math.max(most, item.hours), 0)

  const deadlineDay = items.reduce<number | null>(
    (earliest, item) =>
      item.deadlineDay === null ? earliest : Math.min(earliest ?? item.deadlineDay, item.deadlineDay),
    null,
  )

  return { ...ask, hours, deadlineDay, hard: deadlineDay !== null }
}
