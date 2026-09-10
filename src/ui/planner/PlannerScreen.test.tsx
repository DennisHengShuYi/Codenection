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
  const props = { onAccept: vi.fn(), onBack: vi.fn(), onClose: vi.fn() }
  render(<PlannerScreen {...props} />)
  return props
}

const dump = async (text: string) => {
  await userEvent.type(screen.getByLabelText(/on your mind/i), text)
  await userEvent.click(screen.getByRole('button', { name: /read this/i }))
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
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([expect.objectContaining({ title: 'laundry' })])
  })

  it('keeps a correction the student made to a chip', async () => {
    const props = setup()

    await dump('gym')
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(1))

    await userEvent.selectOptions(screen.getByLabelText(/kind/i), 'mental')
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
