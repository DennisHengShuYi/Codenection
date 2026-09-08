import { describe, expect, it } from 'vitest'
import { HORIZON_DAYS } from '../engine'
import { carryOverWeek } from './carryOver'
import { createLocalRepository } from './localRepository'

const week = (mental: number) => ({
  items: [],
  start: { mental, physical: 60, social: 50, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

/** Two real stores rather than stubs: the behaviour is entirely about moving data between
 *  stores, and stubbing them would verify the test's own assumptions instead. */
let counter = 0

const twoStores = async () => {
  // Distinct databases, because two repositories sharing one would be the same store --
  // and the carry-over would then read back its own data and look like it had succeeded.
  counter += 1
  const from = createLocalRepository(`carry-from-${counter}`)
  const to = createLocalRepository(`carry-to-${counter}`)
  await from.clear()
  await to.clear()
  return { from, to }
}

describe('carryOverWeek', () => {
  /**
   * Somebody builds a fortnight in the preview, then creates an account. Discarding it
   * would punish them for the order they happened to do things in.
   */
  it('moves a preview week into the new account', async () => {
    const { from, to } = await twoStores()
    await from.saveWeek(week(42))

    expect(await carryOverWeek(from, to)).toBe(true)
    expect((await to.loadWeek())?.start.mental).toBe(42)
  })

  /**
   * Their real week wins. Losing a preview is an annoyance; losing the fortnight they
   * have kept for a month is not, and if only one can happen it should be the first.
   */
  it('does not overwrite a week the account already has', async () => {
    const { from, to } = await twoStores()
    await from.saveWeek(week(42))
    await to.saveWeek(week(7))

    expect(await carryOverWeek(from, to)).toBe(false)
    expect((await to.loadWeek())?.start.mental).toBe(7)
  })

  it('does nothing when there is no preview week', async () => {
    const { from, to } = await twoStores()

    expect(await carryOverWeek(from, to)).toBe(false)
    expect(await to.loadWeek()).toBeNull()
  })
})
