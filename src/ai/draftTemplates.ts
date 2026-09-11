import type { RequestCost } from '../domain/requestCost'
import type { ParsedItem } from './types'

/** §2.3's three: a soft decline, a defer with a proposed date, and an accept with the
 *  trade-off named out loud. */
export type Tone = 'decline' | 'defer' | 'accept'

export interface Draft {
  readonly tone: Tone
  readonly text: string
}

/**
 * A real fallback, not a stub.
 *
 * Unlike a photograph, a decline genuinely can be written by rules: the app already knows
 * the only two facts that matter -- what was asked, and what saying yes would cost. §10
 * requires a hardcoded fallback for every external dependency, and this one keeps the
 * feature working on a machine with no key, which includes CI and the demo laptop.
 *
 * Written in the student's own voice throughout. The app never declines on anyone's behalf
 * and never sends anything; it does the work of declining and hands over the words (§2.3).
 */
export function templateDrafts(item: ParsedItem, cost: RequestCost): Draft[] {
  const what = item.title.trim()
  const evenings = cost.eveningsEquivalent

  const tradeOff =
    evenings >= 1
      ? ` It will cost me about ${evenings === 1 ? 'an evening' : `${evenings} evenings`} of downtime, so I want to be upfront that I will be tight that week.`
      : ' I want to be upfront that the next couple of weeks are already full for me.'

  /**
   * Deliberately vague, and deliberately not a day index.
   *
   * This text is sent to another person. "Could it wait until around day 12?" means nothing
   * to a recipient who has never seen this app's fortnight, and day 12 was the model's own
   * counting besides. A real date would read better -- and `briefFor` above is explicit that
   * a drafting call is sent the request and nothing else, "not the week, not the schedule",
   * so there is no date here to offer and that is the right trade.
   *
   * So it says what it can stand behind: that the student is full now and will have room
   * later, without naming a day the other person cannot check and the app should not share.
   */
  const when = cost.firstDeficitDayAfter === null ? 'next week' : 'the week after next'

  return [
    {
      tone: 'decline',
      text: `Thanks for thinking of me for ${what}. I am going to have to pass this time — the next couple of weeks are already fuller than I would like, and I would rather say no now than let you down later.`,
    },
    {
      tone: 'defer',
      text: `I would like to help with ${what}, but not this week — I am already at my limit. Could it wait until around ${when}? I could give it proper attention then.`,
    },
    {
      tone: 'accept',
      text: `Happy to help with ${what}.${tradeOff} Let me know what you need from me.`,
    },
  ]
}
