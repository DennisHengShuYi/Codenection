import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { CHARACTER_BOTTOM } from './scene/palette'
import { HORIZON_DAYS } from '../../engine'
import { RoomShell } from './RoomShell'

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
    // Social AND physical low, and a block running its own slot right now, so the stuck
    // card stacks a second candidate beside the day's own question -- two cards above the
    // threshold, one below it.
    await repository.saveWeek({
      items: [
        {
          id: 'laundry',
          title: 'Laundry',
          type: 'errands',
          kind: 'errands',
          hours: 24,
          intensity: 1,
          dayIndex: 0,
          startHour: 0,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        },
      ],
      start: { mental: 8, physical: 9, social: 7, errands: 10 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 6),
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    const cards = [
      screen.queryByTestId('overfull'),
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
    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    // Ruling 61: out of the collapsed interface, the paragraph is no longer under the room
    // -- it waits behind the `Waiting` button with the rest of what there is to read. The
    // uncapped version is what proves the mode really came off.
    await userEvent.click(screen.getByTestId('open-notices'))
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
   * outranks `stuck`, does not apply. With a week that rearranging can still fix, `overfull`
   * cannot apply either.
   */
  /**
   * A student who has kept up with themselves and is still stuck on one chore.
   *
   * `recovery` outranks `stuck` in §3's card precedence, and it fires on neglect now rather
   * than on a low reserve -- so without these the room would show the recovery card and this
   * file would be testing a route it does not mean to. Short blocks in the recent past,
   * confirmed in the log, which is what actually restarts a rhythm's clock: a plan is not
   * evidence.
   */
  const KEPT_UP = (['rest', 'lightExercise', 'hardExercise', 'socialRestorative'] as const).map(
    (kind, index) => ({
      id: `kept-${kind}`,
      title: kind,
      type: (kind === 'socialRestorative' ? 'social' : kind === 'rest' ? 'mental' : 'physical') as
        | 'social'
        | 'mental'
        | 'physical',
      kind,
      hours: 0.5,
      intensity: 1,
      dayIndex: 3,
      startHour: 7 + index,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    }),
  )

  const KEPT_UP_LOG = KEPT_UP.map((block) => ({
    blockId: block.id,
    type: block.type,
    plannedHours: block.hours,
    dayIndex: block.dayIndex,
    answer: 'right' as const,
    answeredAt: 0,
  }))

  /**
 * A drained student with exactly one live card, whichever card that turns out to be.
 *
 * It used to be the stuck task this helper is named for, and is now the overfull day: the
 * fortnight this fixture describes is past what rearranging can fix, and `overfull` outranks
 * `stuck` in the order. What is being measured below is the gauge and the address, neither of
 * which cares which card supplied the premise -- but the premise is asserted rather than
 * assumed, so a precedence change fails here loudly instead of quietly making the route
 * untravelled.
 */
const drainedWithOneCard = async (label: string) => {
    counter += 1
    const repository = createLocalRepository(`${label}-${counter}`)
    await repository.clear()
    // Four days in, with the block on today and running the whole waking day -- the only way
    // a fixture can be inside its own slot whatever hour the suite happens to run at.
    // Local, not `toISOString`: `todayIndex` reads the device's own zone, and east of
    // Greenwich the UTC date is yesterday's for the first eight hours of every day -- which
    // would put the block on day 4 while the app thought today was day 5, and the trigger
    // would miss by exactly one day depending on when the suite ran.
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
    const startedOn = [
      fourDaysAgo.getFullYear(),
      String(fourDaysAgo.getMonth() + 1).padStart(2, '0'),
      String(fourDaysAgo.getDate()).padStart(2, '0'),
    ].join('-')
    await repository.saveWeek({
      items: [
        {
          id: 'laundry',
          title: 'Laundry',
          type: 'errands',
          kind: 'errands',
          hours: 24,
          intensity: 1,
          dayIndex: 4,
          startHour: 0,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        },
        ...KEPT_UP,
      ],
      start: { mental: 70, physical: 70, social: 70, errands: 10 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      startedOn,
    })

    render(<RoomShell repository={repository} blockLog={KEPT_UP_LOG} onAnswerBlock={vi.fn()} />)

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    // The premise, asserted rather than assumed. If precedence ever changes so that no card
    // renders here, this fails loudly instead of the assertions below passing because the
    // route was never walked.
    expect(screen.queryByTestId('open-week')).toBeNull()
    await screen.findByTestId('overfull')

    return repository
  }

  it('leaves the gauge a readout rather than a door, so there is nothing to press', async () => {
    await drainedWithOneCard('low-energy-one-card')

    // The premise: this student is in the collapsed interface and has a live card.
    expect(screen.getByTestId('room-gauge').tagName).not.toBe('BUTTON')
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
  })

  it('withholds the breakdown even from an address typed by hand', async () => {
    window.history.replaceState(null, '', '/reserves')
    await drainedWithOneCard('low-energy-one-card-address')

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
  /**
   * Removed with the route it walked.
   *
   * It opened a block from the micro-start card -- the only live card that ever navigated to
   * one -- and that card is gone. No remaining card opens a block, and the waiting list that
   * does is withheld below §1.5's threshold, so there is no longer a way for a depleted
   * student to reach a block from the room at all.
   *
   * What it was protecting is Ruling 60's rule that Back follows the history, and that is
   * pinned directly in `view.test.ts` ("comes back to the week from a block, not the room",
   * and the room cases beside it) rather than through a card that happened to navigate.
   */

  /**
   * The other direction, so the tests above cannot all pass by the breakdown simply never
   * rendering anywhere. Same student, low-energy mode turned off by hand -- and the gauge
   * is a door again.
   */
  it('hands the same student the breakdown once low-energy mode is turned off', async () => {
    await drainedWithOneCard('low-energy-one-card-off')

    await userEvent.click(screen.getByTestId('open-settings'))
    await userEvent.click(await screen.findByRole('radio', { name: /full interface/i }))
    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('room-gauge'))

    expect(await screen.findByRole('dialog', { name: /reserves/i })).toBeVisible()
    expect(screen.getAllByRole('meter').length).toBeGreaterThan(0)
  })
})

describe('the collapsed interface, measured against the character', () => {

  /**
   * Moved here by Ruling 61, which emptied the band for an ordinary week: the only room
   * that still has one is the collapsed interface, holding the single card §1.5 keeps. The
   * cap is what stops that card growing over the character, so it is measured where the
   * band actually renders.
   *
   * The other end of `Character.test.tsx`'s measurement, and the reason that one is worth
   * having: the band's cap is a Tailwind arbitrary value, which cannot read a TypeScript
   * constant, so nothing made the cap and the artwork move together. `room.spec.ts` catches
   * the drift at four viewports in a real browser -- but only as an unexplained geometric
   * failure, and only for the pair of numbers that happen to be in the string today.
   *
   * So the percentages are re-derived here from `CHARACTER_BOTTOM` and the fill viewBox the
   * room draws into (`Room.tsx`: `0 0 300 260`). The character sits at
   * `CHARACTER_BOTTOM x min(stageWidth/300, stageHeight/260)` down the stage, which is
   * `min(CHARACTER_BOTTOM/300 of the width, CHARACTER_BOTTOM/260 of the height)`; the band
   * may have the rest, less a finger's margin. Raise `CHARACTER_BOTTOM` and this fails at
   * the line that has to change.
   *
   * Percentages rather than `dvh`, deliberately: the cap resolves against the stage, and
   * `App` gives the stage less than the viewport when the degraded-storage notice is above
   * it. `100dvh` there would cap the band against a height the stage does not have.
   */
  it('caps the band at the space the character leaves, derived rather than typed', async () => {
    await renderDrained()
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

    const across = ((CHARACTER_BOTTOM / 300) * 100).toFixed(2)
    const down = ((CHARACTER_BOTTOM / 260) * 100).toFixed(2)

    expect(screen.getByTestId('room-band').className).toContain(
      `max-h-[calc(100%-min(${across}vw,${down}%)-1rem)]`,
    )
  })
})
