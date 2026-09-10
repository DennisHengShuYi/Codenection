import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS, HORIZON_DAYS } from '../../engine'
import type { BlockRecord } from '../../domain/blockLog'
import type { Schedule } from '../../optimizer'
import { RequestBoxScreen } from './RequestBoxScreen'

/**
 * The endpoint is stubbed unreachable throughout, so both the parsing and the drafting run
 * their rule-based paths -- which is what CI, a key-less machine and the demo laptop use.
 * Unlike photo import there is no gap here: the whole feature works without a model.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const week = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

const setup = (over: Partial<Parameters<typeof RequestBoxScreen>[0]> = {}) => {
  const props = {
    schedule: week(),
    params: DEFAULT_PARAMS,
    today: 0,
    blockLog: [],
    onAccept: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  }
  const { unmount } = render(<RequestBoxScreen {...props} />)
  return { ...props, unmount }
}

const ask = async (text = 'can you help with our group project, 6 hours, by friday') => {
  await userEvent.type(screen.getByLabelText(/what.*asked|request/i), text)
  await userEvent.click(screen.getByRole('button', { name: /what would this cost/i }))
  await waitFor(() => expect(screen.getByTestId('request-cost')).toBeVisible())
}

describe('RequestBoxScreen', () => {
  it('opens with an empty box and no price', () => {
    setup()

    expect(screen.queryByTestId('request-cost')).toBeNull()
    expect(screen.queryByRole('button', { name: /take it on/i })).toBeNull()
  })

  // The student must be able to fix "3 hours" before being priced on it.
  it('turns a pasted request into a correctable chip', async () => {
    setup()
    await ask()

    expect(screen.getByTestId(/^chip-/)).toBeVisible()
    expect(screen.getByLabelText(/kind/i)).toBeVisible()
  })

  it('names the reserve figure it would leave them at', async () => {
    setup()
    await ask()

    expect(screen.getByTestId('request-cost').textContent).toMatch(/\d+/)
  })

  /**
   * §2.4's whole point is that a student's own estimate bias, learned from Reality Check,
   * is measurably different from the population default -- so the one screen pricing a
   * commitment for them must price it with their own calibrated numbers, not everyone
   * else's. Regression guard for the bug where this screen always priced against
   * `DEFAULT_PARAMS` regardless of what was passed in.
   */
  it('prices the request with the calibrated params it is given, not the population default', async () => {
    const heavilyBiased = {
      ...DEFAULT_PARAMS,
      estimateBias: { mental: 3, physical: 3, social: 3, errands: 3 },
    }

    const first = setup({ params: DEFAULT_PARAMS })
    await ask()
    const defaultText = screen.getByTestId('request-cost').textContent
    first.unmount()

    setup({ params: heavilyBiased })
    await ask()
    const biasedText = screen.getByTestId('request-cost').textContent

    expect(biasedText).not.toBe(defaultText)
  })

  /**
   * §2.3 requires the warning to be shown with §1.3's two-state room comparison, and
   * RoomComparison was built for this in the room plan with a comment naming this feature
   * as the caller it was waiting for.
   */
  it('shows your room beside the room you would have', async () => {
    setup()
    await ask()

    expect(screen.getByTestId('room-comparison')).toBeVisible()
  })

  /**
   * Ruling 51: the two rooms in the comparison are priced from the student's own block log,
   * the same as every other number on every other screen.
   *
   * `roomModel`'s `blockLog` was optional-with-default, and this screen's `roomFor` took the
   * default -- so the request box showed a reserve percentage computed as though the student
   * had answered nothing, beside a request cost computed from their real calibration. One
   * week, two numbers, on one screen. The room's own description is where that shows: its
   * weather is read off the projection, and the projection is what the bias moves.
   */
  it('draws the comparison rooms from the block log, not from a blank one', async () => {
    const heavy = (): Schedule => ({
      ...week(),
      items: Array.from({ length: 13 }, (_, day) => ({
        id: `i${day}`,
        title: `i${day}`,
        type: 'mental' as const,
        kind: 'studyBlock' as const,
        hours: 8,
        intensity: 1.3,
        dayIndex: day,
        startHour: 9,
        fixed: false,
        deadlineDay: null,
        protectedRest: false,
      })),
    })

    // Every block took longer than planned: §2.4's estimate bias, learned from the student's
    // own answers, and the one thing a blank log cannot know.
    const alwaysLonger: BlockRecord[] = Array.from({ length: 13 }, (_, day) => ({
      blockId: `i${day}`,
      type: 'mental',
      plannedHours: 8,
      dayIndex: day,
      answer: 'longer',
      answeredAt: 0,
    }))

    const blank = setup({ schedule: heavy(), blockLog: [] })
    await ask()
    const uncalibrated = screen.getAllByTestId('room-scene')[0]?.getAttribute('aria-label')
    blank.unmount()

    setup({ schedule: heavy(), blockLog: alwaysLonger })
    await ask()

    expect(screen.getAllByTestId('room-scene')[0]?.getAttribute('aria-label')).not.toBe(
      uncalibrated,
    )
    // Named rather than merely different: the calibrated room is the WORSE one, which is
    // the direction a learned underestimate has to move a projection.
    expect(screen.getAllByTestId('room-scene')[0]?.getAttribute('aria-label')).toMatch(/storm/i)
  })

  /**
   * The guard on this plan's central correction. The optimizer removes nothing -- its moves
   * only shift, batch, insert and reorder -- so wording that says a block was given up would
   * be a lie about the model, and the wording is the only place that truth could rot.
   */
  it('never claims a block was removed to make room', async () => {
    setup()
    await ask()

    expect(screen.getByTestId('request-cost').textContent).not.toMatch(
      /removed|deleted|gave up your|cancelled your/i,
    )
  })

  it('offers all three drafted tones', async () => {
    setup()
    await ask()

    await waitFor(() => expect(screen.getAllByTestId(/^draft-/)).toHaveLength(3))
  })

  it('lets a draft be edited before it is copied', async () => {
    setup()
    await ask()
    await waitFor(() => expect(screen.getAllByTestId(/^draft-/)).toHaveLength(3))

    const box = screen.getByTestId('draft-decline')
    await userEvent.type(box, '!')

    expect((box as HTMLTextAreaElement).value).toMatch(/!$/)
  })

  it('accepts nothing until the student says so', async () => {
    const props = setup()
    await ask()

    expect(props.onAccept).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /take it on/i }))

    expect(props.onAccept).toHaveBeenCalledOnce()
  })

  /**
   * A student may well copy the decline and want nothing in their week. Collapsing the two
   * would put an item in their fortnight as a side effect of reading a suggestion.
   */
  it('copying a draft does not accept the request', async () => {
    const props = setup()
    await ask()
    await waitFor(() => expect(screen.getAllByTestId(/^draft-/)).toHaveLength(3))

    await userEvent.click(screen.getAllByRole('button', { name: /copy/i })[0]!)

    expect(props.onAccept).not.toHaveBeenCalled()
  })

  it('can be left without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(props.onCancel).toHaveBeenCalledOnce()
    expect(props.onAccept).not.toHaveBeenCalled()
  })

  it('says so when it cannot read a request, rather than showing an empty price', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /what would this cost/i }))

    expect(await screen.findByTestId('request-problem')).toBeVisible()
    expect(screen.queryByTestId('request-cost')).toBeNull()
  })

  /**
   * The app has no outward-facing action at all -- §2.3 rejected messaging integration, so
   * there is nothing here that could dispatch anything. Asserted rather than assumed,
   * because a "send" button is exactly the kind of convenience that gets added later.
   */
  it('offers no way to send anything', async () => {
    setup()
    await ask()

    expect(screen.queryByRole('button', { name: /^send|email|message them/i })).toBeNull()
  })
})
