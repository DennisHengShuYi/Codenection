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
 * one of three shapes for "something arrives". A lapsed commitment moved onto the room
 * screen as a live card (§3's precedence), reachable without a tap.
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

describe('RoomShell with a lapsed commitment', () => {
  /**
   * §2.3's auto-expiry, at the surface it actually appears on now: a live card on the room
   * screen, reachable with no tap.
   *
   * 25 rather than something lower: it sits in the gap between §1.5's low-energy threshold
   * of 20 and the deficit line at 30, so this fixture does not also exercise the
   * low-energy trimming and mask the assertion this test is actually about.
   */
  it('surfaces a lapsed commitment when the app opens', async () => {
    counter += 1
    const repository = createLocalRepository(`request-lapsed-${counter}`)
    await repository.clear()
    await repository.saveWeek(
      week({
        start: { mental: 25, physical: 25, social: 25, errands: 25 },
        commitments: [
          { id: 'c1', title: 'Committee meeting', reviewDay: -1, itemId: 'added-1' },
        ],
      }),
    )

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one is
    // the press a student makes.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))

    expect(await screen.findByTestId('lapsed-notice')).toHaveTextContent('Committee meeting')
  })

  it('does not surface one the reserve can still hold', async () => {
    counter += 1
    const repository = createLocalRepository(`request-not-lapsed-${counter}`)
    await repository.clear()
    await repository.saveWeek(
      week({
        commitments: [{ id: 'c1', title: 'Committee meeting', reviewDay: -1, itemId: 'added-1' }],
      }),
    )

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.queryByTestId('lapsed-notice')).toBeNull()
  })

  it('dismissing it is not answering it, but does clear it from the screen', async () => {
    counter += 1
    const repository = createLocalRepository(`request-dismiss-${counter}`)
    await repository.clear()
    await repository.saveWeek(
      week({
        start: { mental: 25, physical: 25, social: 25, errands: 25 },
        commitments: [{ id: 'c1', title: 'Committee meeting', reviewDay: -1, itemId: 'added-1' }],
      }),
    )

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    // Ruling 61: the cards wait behind the `Waiting` button now, so getting to one is
    // the press a student makes.
    await waitFor(() => expect(screen.getByTestId('open-notices')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-notices'))
    await screen.findByTestId('lapsed-notice')

    await userEvent.click(screen.getByRole('button', { name: /got it/i }))

    await waitFor(() => expect(screen.queryByTestId('lapsed-notice')).toBeNull())
  })
})
