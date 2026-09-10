import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/**
 * The room screen itself, rather than the components in isolation.
 *
 * §3 gives it a fixed shape: `<h1>`, `PreviewBanner`, `Room`, the `describeRoom` paragraph,
 * `AccuracyNote`, the live cards, then `The week` and `+`. §1.1's compact readout is the
 * room's corner gauge and nothing else (Ruling 53): the five-bar breakdown that Ruling 28
 * correctly rescued from orphanhood was parked here by mistake, giving the room two
 * capacity readings, and it now lives on the week screen. What this file proves: that the
 * room leads, that it reads capacity exactly once, that the breakdown is still reachable
 * from it, and that acting on a block reaches the *stored* week through the week screen and
 * the block sheet rather than a tap on the room itself.
 */
const weekWithErrand = (): Schedule => ({
  items: [
    {
      id: 'laundry',
      title: 'Laundry',
      type: 'errands',
      kind: 'errands',
      hours: 1,
      intensity: 1,
      dayIndex: 2,
      startHour: 17,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    },
  ],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

let counter = 0

const renderWithErrand = async () => {
  counter += 1
  const repository = createLocalRepository(`room-screen-${counter}`)
  await repository.clear()
  await repository.saveWeek(weekWithErrand())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

  return repository
}

describe('RoomShell with the room', () => {
  // §1.1: the room is the surface, the gauge a compact readout inside it -- no tap
  // required for either.
  it('leads with the room and carries the gauge in its own corner', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('room-scene')).toBeVisible()
    expect(screen.getByTestId('room-gauge')).toHaveTextContent(/^\d{1,3}%$/)
  })

  // §1.5's text equivalent stays on screen permanently now, not behind a tap.
  it('states the room in words too, and publishes the accuracy line beside it', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('room-text-equivalent')).toBeVisible()
    expect(screen.getByTestId('accuracy-note')).toBeVisible()
  })

  /**
   * Ruling 53. `CapacityDial` was bolted onto the room screen beneath the two permanent
   * controls, which gave the room two capacity readings: the compact corner gauge §1.1
   * asked for, and a five-bar dashboard the room screen's design never contained (the doc
   * mentions `CapacityDial` once, in a §11 footnote about a colour token). The breakdown
   * moved to the week screen; the room keeps one reading.
   *
   * The behavioural RED: every part of the loud second reading must be absent from the
   * room, and this fails against the screen that shipped.
   */
  it('reads capacity once on the room screen, as the corner gauge alone', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('room-gauge')).toHaveTextContent(/^\d{1,3}%$/)
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
    expect(screen.queryByTestId('dial-gauge')).toBeNull()
    expect(screen.queryByTestId('reserve-text-equivalent')).toBeNull()
  })

  /**
   * The other half of the move, and the half that matters most: Ruling 28 found this
   * content orphaned once and it must not be orphaned again. Reachability is asserted by
   * walking there the way a student does -- one tap on `The week` -- rather than by
   * rendering `CapacityDial` in isolation and assuming somebody links to it.
   */
  it('reaches the five domain bars and the spoken summary through the week screen', async () => {
    await renderWithErrand()

    expect(screen.queryAllByRole('meter')).toHaveLength(0)

    await userEvent.click(screen.getByTestId('open-week'))

    expect(await screen.findAllByRole('meter')).toHaveLength(5)
    expect(screen.getByTestId('reserve-text-equivalent')).toBeVisible()
  })

  /**
   * The low-social warning is the single clearest evidence the model understands burnout
   * rather than summing hours -- a tracker reads a quiet week as healthy. It has already
   * been lost once (Ruling 28), so the move gets its own test rather than riding on the
   * meters above.
   */
  it('still flags a low social reserve as a warning, one tap into the week', async () => {
    counter += 1
    const repository = createLocalRepository(`room-dial-${counter}`)
    await repository.clear()
    await repository.saveWeek({
      items: [],
      start: { mental: 70, physical: 70, social: 20, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))

    expect(await screen.findByTestId('warning-social')).toHaveTextContent(
      /spending a lot of time alone/i,
    )
  })

  /**
   * Flagged by Task 12: the room drawing's `aria-label` is already the full, uncapped text
   * equivalent (`describeRoomFully`). The visible paragraph beneath it repeats a subset of
   * the same sentences (character and weather, always, verbatim) for sighted readers.
   * Without `aria-hidden` a screen reader would announce both back to back -- the full
   * version, then a partial repeat. This is the guard against that regressing silently.
   */
  it('does not double-announce the room to a screen reader', async () => {
    await renderWithErrand()

    const scene = screen.getByTestId('room-scene')
    const paragraph = screen.getByTestId('room-text-equivalent')

    expect(scene.getAttribute('aria-label')).toBeTruthy()
    expect(paragraph).toHaveAttribute('aria-hidden', 'true')
    // Still there for a sighted reader who does not use a screen reader.
    expect(paragraph).toBeVisible()
  })

  it('offers the week and the add sheet as the two permanent controls', async () => {
    await renderWithErrand()

    expect(screen.getByTestId('open-week')).toBeVisible()
    expect(screen.getByTestId('open-add')).toBeVisible()
  })

  // The point of the whole unit: acting on a block has real model consequences.
  it('completing an errand through the week screen removes it from the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /^done$/i }))

    await waitFor(async () => expect((await repository.loadWeek())?.items).toHaveLength(0))
  })

  it('deferring an errand moves it later in the saved week', async () => {
    const repository = await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))
    await userEvent.click(await screen.findByRole('button', { name: /^later$/i }))

    await waitFor(async () =>
      expect((await repository.loadWeek())?.items[0]?.dayIndex).toBeGreaterThan(2),
    )
  })

  /**
   * Coordinator review: "Move" offered no real picker and was indistinguishable in effect
   * from "Later" -- a silent stub. Dropped from `blockActions.ts` rather than left half-real
   * (see its doc comment). This is the regression guard: a movable block's sheet must not
   * offer it.
   */
  it('does not offer Move -- there is no picker behind it', async () => {
    await renderWithErrand()

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-2'))
    await userEvent.click(await screen.findByTestId('block-laundry'))

    expect(screen.queryByRole('button', { name: /move/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^later$/i })).toBeVisible()
  })

  // A protected-rest block asks a binary question rather than the four-way duration one.
  it('answering whether a protected rest block actually happened records it in the block log', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`room-rest-${counter}`)
    await repository.clear()
    await repository.saveWeek({
      items: [
        {
          id: 'nap',
          title: 'Rest',
          type: 'physical',
          kind: 'rest',
          hours: 1,
          intensity: 1,
          dayIndex: 3,
          startHour: 16,
          fixed: true,
          deadlineDay: null,
          protectedRest: true,
        },
      ],
      start: { mental: 70, physical: 70, social: 70, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
    })

    render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={onAnswerBlock} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-3'))
    await userEvent.click(await screen.findByTestId('block-nap'))
    await userEvent.click(await screen.findByTestId('rested-yes'))

    expect(onAnswerBlock).toHaveBeenCalledWith(expect.objectContaining({ blockId: 'nap', answer: 'right' }))
  })

  /**
   * Coordinator review: `Repository.recordBlockAnswer` only upserts, so an "Undo" button on
   * an already-answered past block would produce no visible change -- a second silent stub.
   * Replaced with stating what was actually recorded (`blockActions.ts`'s `recordedAnswer`,
   * rendered by `BlockSheet`). This proves `RoomShell` really threads a real answer from the
   * block log through to that text, not just that `BlockSheet` can render one in isolation.
   */
  it('an already-answered block states what was recorded, with no Undo button', async () => {
    const onAnswerBlock = vi.fn()
    counter += 1
    const repository = createLocalRepository(`room-undo-${counter}`)
    await repository.clear()
    const startedOn = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await repository.saveWeek({
      items: [
        {
          id: 'answered',
          title: 'Answered essay',
          type: 'mental',
          kind: 'studyBlock',
          hours: 2,
          intensity: 1,
          dayIndex: 0,
          startHour: 10,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        },
      ],
      start: { mental: 70, physical: 70, social: 70, errands: 70 },
      horizonDays: HORIZON_DAYS,
      sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      startedOn,
    })
    const answered = [
      {
        blockId: 'answered',
        type: 'mental' as const,
        plannedHours: 2,
        dayIndex: 0,
        answer: 'right' as const,
        answeredAt: 0,
      },
    ]

    render(<RoomShell repository={repository} blockLog={answered} onAnswerBlock={onAnswerBlock} />)
    await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

    await userEvent.click(screen.getByTestId('open-week'))
    await userEvent.click(await screen.findByTestId('day-0'))
    await userEvent.click(await screen.findByTestId('block-answered'))

    expect(screen.queryByRole('button', { name: /undo/i })).toBeNull()
    expect(await screen.findByTestId('recorded-answer')).toHaveTextContent('You said: About right')
    expect(onAnswerBlock).not.toHaveBeenCalled()
  })
})

/**
 * Rulings 54 and 55: the room fills the screen, its three controls sit inside it, and
 * §3's "beneath the drawing" content -- the paragraph, the accuracy line and the live
 * cards -- moves into a band that overlays the lower part of the room.
 *
 * What this file can prove is structure: what contains what, and in which order. The two
 * things that actually broke the last time controls were overlaid are geometric -- a band
 * covering the furniture, and a control nobody can hit -- and jsdom has no layout engine
 * and no Tailwind stylesheet, so a `toBeVisible()` here would pass over a button painted
 * under an opaque band. Those are measured in a real browser instead, in
 * `tests/e2e/room.spec.ts` at 320/390/768/1280.
 */
describe('the room screen, with the controls inside the room', () => {
  /**
   * The trap this branch has already paid for once: the scene carries `role="img"`, which
   * hides its whole subtree from the accessibility tree. A control drawn inside the
   * `<svg>` would look right and be unreachable to a screen reader, so every control has
   * to be a SIBLING positioned over it rather than a child of it.
   */
  it('puts all three controls inside the room, as siblings of the drawing rather than children', async () => {
    await renderWithErrand()

    const stage = screen.getByTestId('room-stage')
    const scene = screen.getByTestId('room-scene')

    expect(stage).toContainElement(scene)

    for (const id of ['open-settings', 'open-week', 'open-add']) {
      const control = screen.getByTestId(id)
      expect(stage).toContainElement(control)
      expect(scene.contains(control)).toBe(false)
    }
  })

  /**
   * The same rule, widened past the three controls named above: nothing inside the drawing
   * is a control, now or later. The check above names `open-settings`, `open-week` and
   * `open-add`; this one fails on a *fourth* control someone drops into the `<svg>` because
   * it aligned nicely there -- which is the way this trap gets sprung, not by moving the
   * three that already have a test each.
   *
   * A CSS locator rather than a role query, and deliberately: `role="img"` hides the
   * subtree from the accessibility tree, so `getAllByRole('button')` scoped to the scene
   * reports zero whether or not any exist -- a guard that cannot fail.
   */
  it('leaves the drawing itself with no controls in it at all', async () => {
    await renderWithErrand()

    const scene = screen.getByTestId('room-scene')

    expect(scene.querySelectorAll('button, a, [role="button"], [role="link"]')).toHaveLength(0)
  })

  /**
   * Ruling 55's choice: the words and the cards overlay the lower room instead of scrolling
   * below it, so nothing that needs the student is off the screen. Structurally that means
   * one band, inside the same stage as the drawing and after it in document order -- two
   * absolutely positioned siblings in one stacking context paint in tree order, so a band
   * placed before the scene would be behind the room's own wall, which is exactly how the
   * corner gauge was invisible for a fortnight (Ruling 52).
   */
  it('gathers the paragraph, the accuracy line and the cards into one band over the room', async () => {
    await renderWithErrand()

    const stage = screen.getByTestId('room-stage')
    const scene = screen.getByTestId('room-scene')
    const band = screen.getByTestId('room-band')

    expect(stage).toContainElement(band)
    expect(band).toContainElement(screen.getByTestId('room-text-equivalent'))
    expect(band).toContainElement(screen.getByTestId('accuracy-note'))
    expect(band).toContainElement(screen.getByRole('region', { name: /today's check-in/i }))

    // Later in the tree than the drawing, so it paints over the room rather than under it.
    expect(Boolean(scene.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  /**
   * The band can hold two cards at 320px, which is taller than the space between the
   * character's head and the bottom of the screen. Rather than let it grow over the
   * character, the band scrolls -- and the two controls are pinned outside that scrolling
   * region, so `The week` and `+` cannot be scrolled off by a long card. That pinning is
   * the difference between "the controls are in the band" and "the controls are reachable".
   */
  it("pins the two controls outside the band's scrolling region", async () => {
    await renderWithErrand()

    const scroller = screen.getByTestId('room-band-content')

    expect(scroller).toContainElement(screen.getByTestId('room-text-equivalent'))
    expect(scroller.contains(screen.getByTestId('open-week'))).toBe(false)
    expect(scroller.contains(screen.getByTestId('open-add'))).toBe(false)
  })
})
