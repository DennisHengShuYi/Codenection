import { describe, expect, it } from 'vitest'
import type { RequestCost } from '../domain/requestCost'
import { templateDrafts } from './draftTemplates'
import type { ParsedItem } from './types'

const item = (over: Partial<ParsedItem> = {}): ParsedItem => ({
  id: 'r1',
  title: 'FYP presentation help',
  type: 'mental',
  hours: 3,
  deadlineDay: 4,
  hard: false,
  confident: true,
  ...over,
})

const cost = (over: Partial<RequestCost> = {}): RequestCost => ({
  firstDeficitDayBefore: null,
  firstDeficitDayAfter: 14,
  floorBefore: 62,
  floorAfter: 28,
  deepestDrop: 34,
  capacityAfter: 41,
  eveningsEquivalent: 2,
  absorbable: false,
  ...over,
})

/**
 * The fallback, and therefore what actually runs on a machine with no key -- which includes
 * CI and the demo laptop. §10 requires a hardcoded fallback for every external dependency,
 * and unlike a photograph a decline genuinely can be written by rules: the app already knows
 * the only two facts that matter, what was asked and what saying yes would cost.
 */
describe('templateDrafts', () => {
  // §2.3 names exactly three: soft decline, defer with a date, accept with the trade-off.
  it('offers all three tones', () => {
    expect(templateDrafts(item(), cost()).map((draft) => draft.tone)).toEqual([
      'decline',
      'defer',
      'accept',
    ])
  })

  /**
   * A draft with a template hole in it is worse than no draft, because a student may paste
   * it without rereading and send "I can help with {title}" to a lecturer.
   */
  it('writes something a person could actually send', () => {
    for (const draft of templateDrafts(item(), cost())) {
      expect(draft.text.length).toBeGreaterThan(20)
      expect(draft.text).not.toMatch(/[{}]|undefined|null|NaN/)
    }
  })

  it('names what was asked for', () => {
    const drafts = templateDrafts(item({ title: 'covering Saturday' }), cost())

    expect(drafts.some((draft) => draft.text.includes('covering Saturday'))).toBe(true)
  })

  // The whole point of deferring rather than refusing.
  it('proposes an actual date in the defer draft', () => {
    const defer = templateDrafts(item(), cost()).find((draft) => draft.tone === 'defer')

    expect(defer?.text).toMatch(/day \d+|next week/i)
  })

  /**
   * §2.3: accept with a *named* trade-off. An acceptance that hides its cost is precisely
   * the behaviour this feature exists to replace.
   */
  it('names the trade-off in the accept draft rather than hiding it', () => {
    const accept = templateDrafts(item(), cost({ eveningsEquivalent: 2 })).find(
      (draft) => draft.tone === 'accept',
    )

    expect(accept?.text).toMatch(/evening/i)
  })

  it('does not invent a trade-off when there is nothing to trade', () => {
    const accept = templateDrafts(item(), cost({ eveningsEquivalent: 0, absorbable: true })).find(
      (draft) => draft.tone === 'accept',
    )

    expect(accept?.text).not.toMatch(/\b0 evenings?\b/)
  })

  it('says one evening rather than 1 evenings', () => {
    const accept = templateDrafts(item(), cost({ eveningsEquivalent: 1 })).find(
      (draft) => draft.tone === 'accept',
    )

    expect(accept?.text).toMatch(/an evening/i)
  })

  /**
   * The app never declines on anyone's behalf and never sends anything -- it does the work
   * of declining and hands over the words. A draft that mentions the app is a draft the
   * student has to edit before it is usable.
   */
  it("writes in the student's own voice, not the app's", () => {
    for (const draft of templateDrafts(item(), cost())) {
      expect(draft.text).not.toMatch(/\bthe app\b|codenection|my planner told me/i)
    }
  })

  it('handles a request with no deadline at all', () => {
    const drafts = templateDrafts(item({ deadlineDay: null }), cost({ firstDeficitDayAfter: null }))

    for (const draft of drafts) expect(draft.text).not.toMatch(/[{}]|undefined|null/)
  })
})
