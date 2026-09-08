import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ObjectDetail } from './ObjectDetail'
import type { RoomState } from './roomState'

const state: RoomState = {
  ceilingPressure: 0.4,
  paperHeight: 0.6,
  clutter: [{ id: 'laundry', title: 'Laundry', dayIndex: 2 }],
  plantHealth: 0.3,
  sleepDebt: 1.5,
  weather: 'clouding',
  lightLevel: 0.5,
  doorLit: true,
  character: 'holdingOn',
}

const setup = (objectId: string) => {
  const props = { objectId, state, onComplete: vi.fn(), onDefer: vi.fn(), onClose: vi.fn() }
  render(<ObjectDetail {...props} />)
  return props
}

describe('ObjectDetail', () => {
  // §1.3: "Tap any object for its numbers."
  it('shows the numbers behind an object', () => {
    setup('plant')

    expect(screen.getByRole('dialog')).toHaveTextContent(/\d/)
  })

  it('names what the object is measuring', () => {
    setup('window')

    expect(screen.getByRole('dialog')).toHaveTextContent(/ahead|horizon|projection/i)
  })

  it('offers to complete or defer a clutter box', () => {
    setup('laundry')

    expect(screen.getByRole('button', { name: /done/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /later/i })).toBeVisible()
  })

  it('completes the errand', async () => {
    const props = setup('laundry')

    await userEvent.click(screen.getByRole('button', { name: /done/i }))

    expect(props.onComplete).toHaveBeenCalledWith('laundry')
  })

  it('defers the errand', async () => {
    const props = setup('laundry')

    await userEvent.click(screen.getByRole('button', { name: /later/i }))

    expect(props.onDefer).toHaveBeenCalledWith('laundry')
  })

  /**
   * §6.4 says deferred load compounds rather than vanishing, and rolling debt is not
   * built. Saying so is the difference between a simplification and a lie.
   */
  it('says plainly that deferring costs more later', () => {
    setup('laundry')

    expect(screen.getByRole('dialog')).toHaveTextContent(/cost|not go away/i)
  })

  // Only clutter has actions, because only clutter is something the student can act on.
  it('offers no actions for an object that is not clutter', () => {
    setup('plant')

    expect(screen.queryByRole('button', { name: /done/i })).toBeNull()
  })

  it('closes', async () => {
    const props = setup('plant')

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
  })
})
