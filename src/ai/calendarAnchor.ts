import { WEEKDAY_NAMES } from '../domain/calendar'
import type { Calendar } from './types'

const WEEKDAYS = WEEKDAY_NAMES

/**
 * The longest a `todayLabel` may be.
 *
 * A date is short. The label is interpolated straight into a system prompt, so anything
 * long arriving at this boundary is not a student's week -- it is someone using the prompt
 * as a channel.
 */
const LONGEST_LABEL = 40

/**
 * Ruling 44's anchor, read off the wire and validated rather than trusted.
 *
 * Anyone can POST to the endpoints that call this, and what comes back out of it goes into
 * a prompt. A weekday outside 0-6, a fractional day index or an essay in place of a date is
 * not a calendar, so it is refused and the reader falls back to behaving as it did before
 * anyone thought to send one.
 *
 * Shared by `api/plan.ts` and `api/read-photo.ts`. It lived inside the first of those, and
 * a second copy beside the second would have been free to drift -- accepting a longer label
 * on one endpoint than the other, which is precisely the kind of difference nobody notices
 * until it is the way in.
 */
export const readCalendar = (raw: unknown): Calendar | undefined => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined

  const { today, startWeekday, todayLabel } = raw as Record<string, unknown>

  if (typeof today !== 'number' || !Number.isInteger(today) || today < 0 || today > 365) {
    return undefined
  }
  if (typeof startWeekday !== 'number' || !Number.isInteger(startWeekday)) return undefined
  if (startWeekday < 0 || startWeekday > 6) return undefined

  const label =
    typeof todayLabel === 'string' && todayLabel.length > 0 && todayLabel.length <= LONGEST_LABEL
      ? todayLabel
      : undefined

  return { today, startWeekday, ...(label === undefined ? {} : { todayLabel: label }) }
}

/**
 * Ruling 44's anchor, said to a model. Empty for a week that has never been dated, because there
 * is nothing true to say and a made-up date is a confident wrong answer.
 *
 * The wording was earned by a live call rather than reasoned out, which is the strongest
 * reason for both prompts to share it. "Count named weekdays forward from that day, and
 * never backwards into the past" was the first attempt; the real model answered it by
 * dropping the day altogether -- `deadlineDay: null` for "gym thursday 7pm", which is worse
 * than the wrong day it replaced. Asking it to COMPUTE the date fixed it.
 */
export const anchorLines = (calendar?: Calendar): string => {
  if (calendar?.todayLabel === undefined) return ''

  const weekday = WEEKDAYS[(calendar.startWeekday + calendar.today) % 7]

  return [
    `Day 0 is ${calendar.todayLabel}, a ${weekday}.`,
    'A named weekday means its next occurrence on or after day 0: work out that date and',
    'give its day index. Never answer null for a weekday the student actually named.',
  ].join(' ')
}
