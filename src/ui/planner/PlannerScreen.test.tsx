import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlannerScreen } from './PlannerScreen'

/**
 * The endpoint is stubbed as unreachable throughout, so every case here exercises the
 * rule-based path -- which is also what CI, local development and a network-less demo run
 * on. Nothing in this file can reach a live model.
 */
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no endpoint'))))
afterEach(() => vi.unstubAllGlobals())

const setup = () => {
  const props = {
    onAccept: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    dayLabels: ['Today, Mon 8 Sep', 'Tue 9 Sep', 'Wed 10 Sep', 'Thu 11 Sep', 'Fri 12 Sep'],
    calendar: { today: 0, startWeekday: 5, todayLabel: '11 September 2026' },
  }
  render(<PlannerScreen {...props} />)
  return props
}

const dump = async (text: string) => {
  await userEvent.type(screen.getByLabelText(/on your mind/i), text)
  await userEvent.click(screen.getByRole('button', { name: /read this/i }))
}

/**
 * §43: every chip has to say which day it lands on before the accept opens. A student does
 * this by answering the chip's own question; a test does it the same way, rather than
 * reaching around the gate.
 */
const sayWhen = async (dayIndex = '2') => {
  for (const select of screen.getAllByTestId(/^when-day-/)) {
    await userEvent.selectOptions(select, dayIndex)
  }
}

describe('PlannerScreen', () => {
  // There must be no state in which a student could accept something they have not seen.
  it('starts with an empty box and nothing to accept', () => {
    setup()

    expect(screen.getByLabelText(/on your mind/i)).toHaveValue('')
    expect(screen.queryByRole('button', { name: /add these/i })).toBeNull()
  })

  it('turns a brain dump into chips', async () => {
    setup()

    await dump('essay due friday, gym, laundry')

    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(3))
  })

  // The whole point of the unit, so it is asserted directly rather than implied.
  it('accepts nothing until the student says so', async () => {
    const props = setup()

    await dump('gym, laundry')
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    expect(props.onAccept).not.toHaveBeenCalled()

    await sayWhen()
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ title: 'gym' })]),
    )
  })

  it('drops an item the student removed', async () => {
    const props = setup()

    await dump('gym, laundry')
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!)
    await sayWhen()
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([expect.objectContaining({ title: 'laundry' })])
  })

  it('keeps a correction the student made to a chip', async () => {
    const props = setup()

    await dump('gym')
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.selectOptions(screen.getByLabelText(/kind/i), 'mental')
    await sayWhen()
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([expect.objectContaining({ type: 'mental' })])
  })

  // An empty list would look like a bug rather than an answer.
  it('says when it understood nothing', async () => {
    setup()

    await userEvent.click(screen.getByRole('button', { name: /read this/i }))

    expect(await screen.findByText(/could not find anything/i)).toBeVisible()
  })

  /**
   * Ruling 60 split the one `Cancel` into two: Back goes up to the chooser, close is done
   * with the whole thing. Both are the container's own controls now, so both are asserted
   * here -- the screen's job is only to hand them somewhere to go.
   */
  it('can be stepped back to the chooser without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('sheet-back'))

    expect(props.onBack).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onAccept).not.toHaveBeenCalled()
  })

  it('can be closed outright without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onBack).not.toHaveBeenCalled()
    expect(props.onAccept).not.toHaveBeenCalled()
  })
})

/**
 * §43: nothing reaches the week until it says when it happens.
 *
 * `parseBrainDump` returns `deadlineDay: null` whenever the text implied no day -- which is
 * most of what a student types. The old flow accepted those anyway and let `placement.ts`
 * choose, so an entry landed on a day nobody had named. The chip asks; this holds the
 * accept shut until the question is answered.
 */
describe('the accept, held shut until the week knows when', () => {
  const typeAndRead = async () => {
    await userEvent.type(screen.getByLabelText(/on your mind/i), 'read chapter 3')
    await userEvent.click(screen.getByRole('button', { name: /read this/i }))
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))
  }

  it('will not add an item that has no day yet', async () => {
    setup()
    await typeAndRead()

    // The premise: the rules found no day in "read chapter 3", which is the ordinary case.
    expect(screen.getByTestId(/^when-missing-/)).toBeVisible()
    expect(screen.getByRole('button', { name: /add these/i })).toBeDisabled()
  })

  it('adds once the day has been given', async () => {
    const props = setup()
    await typeAndRead()

    await userEvent.selectOptions(screen.getByTestId(/^when-day-/), '2')

    expect(screen.getByRole('button', { name: /add these/i })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([expect.objectContaining({ deadlineDay: 2 })])
  })

  it('says why it is holding, rather than disabling a button for no visible reason', async () => {
    setup()
    await typeAndRead()

    expect(screen.getByTestId('when-blocked')).toHaveTextContent(/when/i)
  })
})
