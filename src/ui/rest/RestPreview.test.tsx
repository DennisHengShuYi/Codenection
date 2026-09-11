import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RestGain, RestPlan } from '../../domain/restNow'
import { RestPreview } from './RestPreview'

const gain: RestGain = {
  dayBefore: 62,
  dayAfter: 71,
  floorBefore: 28,
  floorAfter: 28,
  firstDeficitDayBefore: 9,
  firstDeficitDayAfter: 14,
  deepestLift: 9,
}

const block = { dayIndex: 3, startHour: 14, hours: 2 }

const show = (plan: RestPlan, over: Partial<Parameters<typeof RestPreview>[0]> = {}) =>
  render(
    <RestPreview
      plan={plan}
      today={3}
      onApprove={vi.fn()}
      onDiscard={vi.fn()}
      onClose={vi.fn()}
      {...over}
    />,
  )

const move = {
  move: {
    kind: 'shift',
    itemId: 'essay',
    description: 'Move Ethics essay to Monday',
    apply: (schedule: never) => schedule,
  },
  worstBefore: 30,
  worstAfter: 34,
  gain: 4,
  deficitDaysBefore: 3,
  deficitDaysAfter: 2,
} as never

describe('RestPreview when the rest simply fits', () => {
  const fits: RestPlan = { kind: 'fits', block, gain }

  it('says how long, when, and what it is worth', () => {
    show(fits)

    const summary = screen.getByTestId('rest-summary').textContent ?? ''
    expect(summary).toMatch(/2 hours/i)
    expect(summary).toMatch(/62/)
    expect(summary).toMatch(/71/)
  })

  it('offers a way to take it', () => {
    show(fits)

    expect(screen.getByTestId('approve-rest')).toBeVisible()
  })

  it('calls half an hour half an hour', () => {
    // MIN_GAP_HOURS is 0.5, so a thirty-minute block is reachable whenever the day is
    // nearly full. The general "N and a half hours" phrasing renders it as "0 and a half
    // hours", which reads as a bug in the app rather than as a short break.
    show({ kind: 'fits', block: { ...block, hours: 0.5 }, gain })

    expect(screen.getByTestId('rest-summary')).toHaveTextContent(/half an hour/i)
    expect(screen.getByTestId('rest-summary')).not.toHaveTextContent(/0 and a half/i)
  })

  it('names no move, because nothing of the student"s is moving', () => {
    show(fits)

    expect(screen.queryByTestId('rest-move')).toBeNull()
  })
})

describe('RestPreview when something has to move', () => {
  const needsMove: RestPlan = { kind: 'needsMove', block, gain, move }

  it('names the move in its own words before anything is applied', () => {
    show(needsMove)

    expect(screen.getByTestId('rest-move')).toHaveTextContent('Move Ethics essay to Monday')
  })

  it('still asks rather than applying', () => {
    show(needsMove)

    expect(screen.getByTestId('approve-rest')).toBeVisible()
    expect(screen.getByTestId('discard-rest')).toBeVisible()
  })
})

describe('RestPreview when today will not take it', () => {
  const laterDay: RestPlan = {
    kind: 'laterDay',
    block: { ...block, dayIndex: 5 },
    gain,
    whyNotToday: 'There is no stretch of today left with room in it.',
  }

  it('says why today was not the answer', () => {
    show(laterDay)

    expect(screen.getByTestId('rest-why')).toHaveTextContent(/no stretch of today/i)
  })

  it('still offers the later day rather than only refusing', () => {
    show(laterDay)

    expect(screen.getByTestId('approve-rest')).toBeVisible()
  })
})

describe('RestPreview when there is nowhere for it', () => {
  const refused: RestPlan = { kind: 'refused', why: 'No day in the fortnight has room.' }

  it('says what is blocking it', () => {
    show(refused)

    expect(screen.getByTestId('rest-why')).toHaveTextContent(/no day in the fortnight/i)
  })

  /** Nothing to approve. A primary button that cannot do anything is worse than none. */
  it('offers nothing to press', () => {
    show(refused)

    expect(screen.queryByTestId('approve-rest')).toBeNull()
  })
})

describe('RestPreview', () => {
  it('applies nothing until it is approved', async () => {
    const onApprove = vi.fn()
    show({ kind: 'fits', block, gain }, { onApprove })

    expect(onApprove).not.toHaveBeenCalled()

    await userEvent.click(screen.getByTestId('approve-rest'))

    expect(onApprove).toHaveBeenCalledTimes(1)
  })

  it('leaves the week alone on discard', async () => {
    const onDiscard = vi.fn()
    show({ kind: 'fits', block, gain }, { onDiscard })

    await userEvent.click(screen.getByTestId('discard-rest'))

    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
