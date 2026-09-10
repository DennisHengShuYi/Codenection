import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import { RoomShell } from './room/RoomShell'

/**
 * §1.5's low-energy mode, absorbed into the room screen rather than a separate view
 * (§11's deliberate deviation). This file used to test `LowEnergyView` replacing the whole
 * screen; it now tests the same screen trimming itself: the week link drops, the paragraph
 * caps to the character sentence, and the card cap falls from two to one.
 */
const drainedWeek = () => ({
  items: [],
  // Below the threshold on every reserve, so the floor is unambiguously low.
  start: { mental: 8, physical: 9, social: 7, errands: 10 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
})

let counter = 0

const renderDrained = async () => {
  counter += 1
  const repository = createLocalRepository(`low-energy-${counter}`)
  await repository.clear()
  await repository.saveWeek(drainedWeek())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  return repository
}

describe('RoomShell in low energy', () => {
  // §1.5: "A student at 12% reserve should not be handed a dashboard." The room stays --
  // it is still the surface -- but the way in to more of it (the week) goes.
  it('drops the week link below the low-energy threshold', async () => {
    await renderDrained()

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.queryByTestId('open-week')).toBeNull()
    // `+` stays: logging something urgent should not require leaving low-energy mode.
    expect(screen.getByTestId('open-add')).toBeVisible()
  })

  it('caps the paragraph to the character sentence alone', async () => {
    await renderDrained()

    await waitFor(() => expect(screen.getByTestId('room-text-equivalent')).toBeVisible())

    const paragraph = screen.getByTestId('room-text-equivalent').textContent ?? ''
    // The drained week is also stormy and clutter-free, so the ordinary paragraph would
    // read as two sentences (character, then weather). Trimmed, only one survives.
    expect(paragraph.split('. ').filter(Boolean)).toHaveLength(1)
  })

  it('still carries the full text to a screen reader, via the drawing itself', async () => {
    await renderDrained()

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    // The cap on the visible paragraph is visual only (§3) -- the drawing's own
    // `aria-label` is `describeRoomFully`, uncapped, so nothing is lost to assistive tech.
    expect(screen.getByTestId('room-scene').getAttribute('aria-label')?.length ?? 0).toBeGreaterThan(
      (screen.getByTestId('room-text-equivalent').textContent ?? '').length,
    )
  })

  /**
   * Ruling 16's second behavioural RED. The rule this guards: below the threshold, `visibleCards`
   * itself already caps to one (proven in `cardPrecedence.test.ts`) -- what only this level
   * can prove is that `RoomShell` actually passes `lowEnergy: true` through rather than
   * silently always requesting the normal cap of two.
   */
  it('shows at most one live card below the threshold', async () => {
    counter += 1
    const repository = createLocalRepository(`low-energy-cards-${counter}`)
    await repository.clear()
    // Social AND physical low: normally this alone would be enough for a recovery card,
    // and a lapsed commitment below stacks a second candidate -- two cards above the
    // threshold, one below it.
    await repository.saveWeek({
      items: [],
      start: { mental: 8, physical: 9, social: 7, errands: 10 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
      commitments: [{ id: 'c1', title: 'Committee meeting', reviewDay: -1, itemId: 'x' }],
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    const cards = [
      screen.queryByTestId('prescription'),
      screen.queryByTestId('lapsed-notice'),
      screen.queryByTestId('micro-start'),
      screen.queryByRole('region', { name: /today's check-in/i }),
    ].filter((card) => card !== null)

    expect(cards).toHaveLength(1)
  })
})
