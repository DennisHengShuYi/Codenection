import type { Repository } from './types'

/**
 * Moves a preview week into a newly signed-in account.
 *
 * Somebody builds a fortnight while looking around, then creates an account. Discarding
 * what they just built would punish them for the order they happened to do things in.
 *
 * It never overwrites a week the account already has. Losing a preview is a small
 * annoyance; losing the real fortnight they have been keeping for a month is not, and if
 * only one of those can happen it should be the first.
 *
 * Returns whether anything moved, so a caller can say so rather than guessing.
 */
export async function carryOverWeek(from: Repository, to: Repository): Promise<boolean> {
  const preview = await from.loadWeek()
  if (preview === null) return false

  const existing = await to.loadWeek()
  if (existing !== null) return false

  await to.saveWeek(preview)
  return true
}
