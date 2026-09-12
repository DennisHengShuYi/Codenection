import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { REVIEW_DAYS } from '../../domain/commitments'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * The request box, split across two owners now. Pricing and drafting a reply moved into
 * the `+` sheet's third way in (§6) -- the request box was never a separate feature, just
 * one of three shapes for "something arrives". What is left here is accepting a request and
 * the provisional yes it writes; what became of that yes when a week could no longer hold it
 * is no longer a card, and the note at the foot of this file says where it went.
 *
 * The endpoint is stubbed unreachable, so the parser and the drafts both run their
 * rule-based paths.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

let counter = 0

const openRequest = async (schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`request-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
  await userEvent.click(screen.getByTestId('open-add'))
  await userEvent.click(screen.getByTestId('add-request'))

  return repository
}

const askAndPrice = async () => {
  await userEvent.type(
    screen.getByLabelText(/what.*asked/i),
    'can you help with our group project, 6 hours, by friday',
  )
  await userEvent.click(screen.getByRole('button', { name: /what would this cost/i }))
  await waitFor(() => expect(screen.getByTestId('request-cost')).toBeVisible())
}

describe('RoomShell with the request box', () => {
  it('comes back without changing anything when stepped back from', async () => {
    const repository = await openRequest()

    // Ruling 60: Back is the way up to the chooser now. `Cancel` had to mean both this
    // and "close the whole thing", depending on which sheet you were standing in.
    await userEvent.click(screen.getByTestId('sheet-back'))
    await waitFor(() => expect(screen.getByTestId('add-request')).toBeVisible())

    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the unit: an accepted request is a real, remembered, provisional yes.
  it('an accepted request reaches the saved week with its commitment recorded', async () => {
    const repository = await openRequest()

    await askAndPrice()
    await userEvent.click(screen.getByRole('button', { name: /take it on/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))

    const saved = await repository.loadWeek()
    expect(saved?.commitments).toHaveLength(1)
    expect(saved?.commitments?.[0]?.reviewDay).toBe(REVIEW_DAYS)
  })
})

/**
 * The lapsed-commitment card used to be tested here, and its behaviour is gone rather than
 * moved.
 *
 * Its trigger was a seven-day timer on a request-box acceptance: it could never appear for a
 * student who had not used the request box, it lapsed every due commitment at once because
 * nothing could tell which one tipped the week, and the deficit that fired it might sit
 * nowhere near the thing being withdrawn. The slot it held now belongs to the overfull day,
 * which asks the question that timer was reaching for -- covered in
 * `RoomShell.overfull.test.tsx`.
 *
 * What survived is the withdrawal message, in `domain/withdrawal.ts` and its own test: the
 * card's trigger was wrong, its sentence was not.
 */
