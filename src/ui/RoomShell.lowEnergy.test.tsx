import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

/**
 * `describeRoom` always emits exactly three sentences (character, weather, and one more);
 * low-energy mode trims the visible paragraph to the character sentence alone. So the count
 * is a second, independent reading of whether the collapse really happened -- one that does
 * not share a cause with `open-week` and cannot quietly stop being able to fail.
 *
 * It replaces assertions on `dial-gauge`, which Ruling 53 moved off the room screen
 * entirely: with the breakdown on the week, `queryByTestId('dial-gauge')` is null here in
 * both modes, so those assertions would have passed whatever low-energy did.
 */
const visibleSentences = (): number =>
  (screen.getByTestId('room-text-equivalent').textContent ?? '').split('. ').filter(Boolean).length

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
    // And `Settings` stays, which matters more now than it did: with the controls moved
    // inside the room (Ruling 54) this button floats over the drawing in a corner, and it
    // is still the only way out of the collapsed interface. Hiding it here to quieten the
    // screen would strand the student in low-energy mode.
    expect(screen.getByTestId('open-settings')).toBeVisible()
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
      screen.queryByTestId('recovery-card'),
      screen.queryByTestId('lapsed-notice'),
      screen.queryByTestId('micro-start'),
      screen.queryByRole('region', { name: /today's check-in/i }),
    ].filter((card) => card !== null)

    expect(cards).toHaveLength(1)
  })
})

/**
 * Ruling 45's reachability tests, and the reason this file's other cases are not enough.
 *
 * §1.5's rule is bidirectional -- "the manual setting wins in both directions" -- and until
 * now `useLowEnergy.setOverride` was wired to no control anywhere in the app, so the reading
 * side was live while the writing side was orphaned. A unit test of `shouldUseLowEnergy`
 * passes happily in that state, which is exactly how the mechanism died unnoticed.
 *
 * These two prove the whole path end to end: the collapsed surfaces really are collapsed,
 * the door to Settings really is reachable from inside the collapsed interface, the control
 * really is in there, and pressing it really does change what the room renders.
 */
describe('the low-energy override, reachable from the settings sheet', () => {
  it('lets a depleted student turn the collapsed interface off', async () => {
    await renderDrained()

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    // Collapsed to begin with: this is the state the student is stuck in today.
    expect(screen.queryByTestId('open-week')).toBeNull()
    expect(visibleSentences()).toBe(1)

    // The door itself, asserted rather than assumed: a control in Settings is no fix at all
    // if `open-settings` is one of the things low-energy mode hides.
    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(await screen.findByRole('radio', { name: /full interface/i }))

    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
    expect(visibleSentences()).toBeGreaterThan(1)
  })

  it('lets a rested student turn the simplified interface on', async () => {
    counter += 1
    const repository = createLocalRepository(`low-energy-on-${counter}`)
    await repository.clear()
    // Well above the threshold, so nothing infers low energy: only the manual setting can
    // produce it. §1.5's documented fallback "for any screen that cannot be made to work at
    // 320px", and the accessibility case -- wanting less is a legitimate preference at any
    // reserve, not only a symptom of being depleted.
    await repository.saveWeek({
      items: [],
      start: { mental: 80, physical: 80, social: 80, errands: 80 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 8),
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(await screen.findByRole('radio', { name: /simplified interface/i }))

    await waitFor(() => expect(screen.queryByTestId('open-week')).toBeNull())
    expect(visibleSentences()).toBe(1)
  })

  // Three states, not a toggle. Dropping `auto` strands anyone who touches the control away
  // from inferred behaviour with no way back to it.
  it('offers a way back to the inferred setting', async () => {
    await renderDrained()

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(await screen.findByRole('radio', { name: /full interface/i }))
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByRole('radio', { name: /decide for me/i }))

    // Back to inferred, which for this drained week means collapsed again.
    await waitFor(() => expect(screen.queryByTestId('open-week')).toBeNull())
  })
})

/**
 * Ruling 56, re-aimed by Ruling 59.
 *
 * `fc58d99` dropped the room's `{!lowEnergy && <CapacityDial/>}` gate and argued, in the
 * commit message and in the spec, that hiding `The week` already hides the dashboard --
 * "one act, not two". That was true of the main route and false of the other one: at low
 * energy `visibleCards` still shows one card, `stuck` is among the likeliest to fire on a
 * bad day, and its button opened a block -- which used to render the entire week screen,
 * breakdown and all, behind the sheet.
 *
 * Ruling 59 moved the breakdown behind the room's corner gauge, so the shape of the risk
 * changed with it: the danger is no longer a screen rendering underneath something else,
 * it is a door left open. The gauge is not a door in low-energy mode, and `/reserves`
 * renders nothing there even when typed by hand.
 *
 * These drive the real route rather than rendering a component with a prop: the whole
 * defect was that nothing connected the mode to the dashboard, and a component-level test
 * of the gate would have passed on the broken build.
 */
describe('the breakdown, and the depleted student who must not be handed it', () => {
  /**
   * Errands alone below the threshold. That is what makes `stuck` the visible card: the
   * floor is 10 so `useLowEnergy` activates and the cap falls to one, while mental, physical
   * and social sit at 70 -- above `prescribe`'s PRESCRIBE_BELOW of 40 -- so `recovery`, which
   * outranks `stuck`, does not apply. With no commitments, `lapsed` cannot apply either.
   */
  const drainedWithStuckTask = async (label: string) => {
    counter += 1
    const repository = createLocalRepository(`${label}-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({
      items: [
        {
          id: 'laundry',
          title: 'Laundry',
          type: 'errands',
          kind: 'errands',
          hours: 1,
          intensity: 1,
          dayIndex: 0,
          startHour: 17,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        },
      ],
      start: { mental: 70, physical: 70, social: 70, errands: 10 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      startedOn,
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    // The premise, asserted rather than assumed. If precedence or the trigger ever changes
    // so that no stuck card renders here, this fails loudly instead of the assertions below
    // passing because the route was never walked.
    expect(screen.queryByTestId('open-week')).toBeNull()
    await screen.findByTestId('micro-start')

    return repository
  }

  it('leaves the gauge a readout rather than a door, so there is nothing to press', async () => {
    await drainedWithStuckTask('low-energy-stuck')

    // The premise: this student is in the collapsed interface and has a live card.
    expect(screen.getByTestId('room-gauge').tagName).not.toBe('BUTTON')
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  it('withholds the breakdown even from an address typed by hand', async () => {
    window.history.replaceState(null, '', '/reserves')
    await drainedWithStuckTask('low-energy-stuck-address')

    // The room, not a dashboard -- and not a blank screen either.
    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.queryByRole('dialog', { name: /reserves/i })).toBeNull()
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  /**
   * The route that started all of this. `fc58d99`'s defect was that a block opened from a
   * live card parked the depleted student on the week screen -- somewhere they had never
   * chosen to go -- with the dashboard on it.
   *
   * Ruling 60 closes the other half of that: Back follows the history, so a block opened
   * from the room returns to the ROOM. `back({kind:'block'})` is still the week, but it is
   * the fallback for a block that was deep-linked, not the answer for one the student
   * walked into from a card.
   */
  it('returns to the room, not the week, from a block opened by a live card', async () => {
    await drainedWithStuckTask('low-energy-stuck-back')

    await userEvent.click(screen.getByRole('button', { name: /i'll do that/i }))
    await screen.findByRole('dialog', { name: /laundry/i })
    await userEvent.click(screen.getByTestId('sheet-back'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.queryByTestId('week-reserves')).toBeNull()
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  /**
   * The other direction, so the tests above cannot all pass by the breakdown simply never
   * rendering anywhere. Same student, low-energy mode turned off by hand -- and the gauge
   * is a door again.
   */
  it('hands the same student the breakdown once low-energy mode is turned off', async () => {
    await drainedWithStuckTask('low-energy-stuck-off')

    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(await screen.findByRole('radio', { name: /full interface/i }))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('room-gauge'))

    expect(await screen.findByRole('dialog', { name: /reserves/i })).toBeVisible()
    expect(screen.getAllByRole('meter').length).toBeGreaterThan(0)
  })
})
