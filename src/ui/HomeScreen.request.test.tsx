import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { REVIEW_DAYS } from '../domain/commitments'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { HomeScreen } from './HomeScreen'

/**
 * The request box wired into the screen. What this covers that the component tests cannot:
 * that accepting reaches the stored week *with its commitment recorded*, and that a lapse
 * surfaces when the app opens.
 *
 * The endpoint is stubbed unreachable, so the parser and the drafts both run their
 * rule-based paths -- the whole feature works with no key.
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

const renderHome = async (schedule = week()) => {
  counter += 1
  const repository = createLocalRepository(`request-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(schedule)

  render(<HomeScreen repository={repository} />)
  await waitFor(() => expect(screen.getByTestId('open-request')).toBeVisible())

  return repository
}

const askAndPrice = async () => {
  await userEvent.click(screen.getByTestId('open-request'))
  await userEvent.type(
    screen.getByLabelText(/what.*asked/i),
    'can you help with our group project, 6 hours, by friday',
  )
  await userEvent.click(screen.getByRole('button', { name: /what would this cost/i }))
  await waitFor(() => expect(screen.getByTestId('request-cost')).toBeVisible())
}

describe('HomeScreen with the request box', () => {
  it('offers the request box as a third way in', async () => {
    await renderHome()

    expect(screen.getByTestId('open-request')).toBeVisible()
  })

  // None of the three input paths is buried behind another.
  it('keeps all the ways in visible together', async () => {
    await renderHome()

    expect(screen.getByTestId('open-planner')).toBeVisible()
    expect(screen.getByTestId('open-request')).toBeVisible()
  })

  it('comes back without changing anything when cancelled', async () => {
    const repository = await renderHome()

    await userEvent.click(screen.getByTestId('open-request'))
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // The point of the unit: an accepted request is a real, remembered, provisional yes.
  it('an accepted request reaches the saved week with its commitment recorded', async () => {
    const repository = await renderHome()

    await askAndPrice()
    await userEvent.click(screen.getByRole('button', { name: /take it on/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(1))

    const saved = await repository.loadWeek()
    expect(saved?.commitments).toHaveLength(1)
    expect(saved?.commitments?.[0]?.reviewDay).toBe(REVIEW_DAYS)
  })

  /**
   * §2.3's auto-expiry, at the surface it actually appears on. The week is seeded with a
   * commitment whose review date has passed and a reserve that cannot hold it.
   *
   * 25 rather than something lower on purpose: it sits in the gap between §1.5's low-energy
   * threshold of 20 and the deficit line at 30. Below 20 the app correctly shows the
   * low-energy view instead of the room, so a more extreme fixture would have tested that
   * branch and never reached this one.
   */
  it('surfaces a lapsed commitment when the app opens', async () => {
    await renderHome(
      week({
        start: { mental: 25, physical: 25, social: 25, errands: 25 },
        commitments: [
          { id: 'c1', title: 'Committee meeting', reviewDay: -1, itemId: 'added-1' },
        ],
      }),
    )

    expect(screen.getByTestId('lapsed-notice')).toHaveTextContent('Committee meeting')
  })

  it('does not surface one the reserve can still hold', async () => {
    await renderHome(
      week({
        commitments: [{ id: 'c1', title: 'Committee meeting', reviewDay: -1, itemId: 'added-1' }],
      }),
    )

    expect(screen.queryByTestId('lapsed-notice')).toBeNull()
  })
})
