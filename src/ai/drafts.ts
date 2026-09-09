import type { RequestCost } from '../domain/requestCost'
import { parseDraftReply } from './draftSchema'
import { templateDrafts, type Draft } from './draftTemplates'
import type { ParsedItem } from './types'

export interface DraftOutcome {
  readonly drafts: readonly Draft[]
  readonly source: 'model' | 'fallback'
}

/**
 * Everything the drafter needs, and nothing it does not.
 *
 * Only the title and the shape of the cost are sent -- not the week, not the schedule, not
 * anything about the student beyond the one request being answered. A drafting call has no
 * use for the rest and no business seeing it.
 */
const briefFor = (item: ParsedItem, cost: RequestCost) => ({
  what: item.title,
  hours: item.hours,
  evenings: cost.eveningsEquivalent,
  deficitDay: cost.firstDeficitDayAfter,
  absorbable: cost.absorbable,
})

/**
 * Drafts the three replies §2.3 names, asking the model and falling back to templates
 * whenever it cannot.
 *
 * Unlike photo import, the fallback here is a genuine equal rather than an apology: the app
 * already knows what was asked and what it would cost, which is everything a decline needs.
 * So this path works with no key at all, and the student never sees a difference in kind.
 */
export async function draftReplies(item: ParsedItem, cost: RequestCost): Promise<DraftOutcome> {
  try {
    const response = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(briefFor(item, cost)),
    })

    if (response.ok) {
      const drafts = parseDraftReply(await response.json())
      if (drafts !== null) return { drafts, source: 'model' }
    }
  } catch {
    // No endpoint, or no network. Falls through to the templates below.
  }

  return { drafts: templateDrafts(item, cost), source: 'fallback' }
}
