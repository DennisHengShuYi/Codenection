import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Room } from './Room'
import type { RoomState } from './roomState'

const state = (over: Partial<RoomState> = {}): RoomState => ({
  ceilingPressure: 0.2,
  paperHeight: 0.2,
  clutter: [],
  plantHealth: 0.8,
  sleepDebt: 0,
  weather: 'clear',
  lightLevel: 0.8,
  doorLit: false,
  character: 'steady',
  ...over,
})

describe('Room', () => {
  // §10: a viewBox and no fixed width is the whole argument for hand-rolling it -- it
  // scales at every breakpoint without a media query.
  it('scales with its container rather than fixing a pixel width', () => {
    render(<Room state={state()} />)
    const scene = screen.getByTestId('room-scene')

    expect(scene).toHaveAttribute('viewBox')
    expect(scene).not.toHaveAttribute('width')
  })

  it('draws all nine objects', () => {
    render(<Room state={state({ clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }] })} />)

    for (const id of [
      'ceiling',
      'papers',
      'clutter',
      'plant',
      'bed',
      'window',
      'light',
      'door',
      'character',
    ]) {
      expect(screen.getByTestId(`room-${id}`)).toBeInTheDocument()
    }
  })

  it('shows one clutter box per pending errand', () => {
    render(
      <Room
        state={state({
          clutter: [
            { id: 'a', title: 'Laundry', dayIndex: 1 },
            { id: 'b', title: 'Post office', dayIndex: 3 },
          ],
        })}
      />,
    )

    expect(screen.getAllByTestId(/^clutter-box-/)).toHaveLength(2)
  })

  it('lights the door when the state says so', () => {
    render(<Room state={state({ doorLit: true })} />)

    expect(screen.getByTestId('room-door')).toHaveAttribute('data-lit', 'true')
  })

  it('reflects the character state', () => {
    render(<Room state={state({ character: 'flattened' })} />)

    expect(screen.getByTestId('room-character')).toHaveAttribute('data-state', 'flattened')
  })

  // §1.3: "Tap any object for its numbers."
  it('tells anyone who taps an object which one it was', async () => {
    const onSelect = vi.fn()
    render(<Room state={state()} onSelect={onSelect} />)

    await userEvent.click(screen.getByTestId('room-plant'))

    expect(onSelect).toHaveBeenCalledWith('plant')
  })

  // A clutter box reports the errand, not "clutter" -- otherwise there is no way to act
  // on the specific thing that was tapped.
  it('reports a clutter box by its own id', async () => {
    const onSelect = vi.fn()
    render(
      <Room
        state={state({ clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }] })}
        onSelect={onSelect}
      />,
    )

    await userEvent.click(screen.getByTestId('clutter-box-a'))

    expect(onSelect).toHaveBeenCalledWith('a')
  })

  // §1.5: the picture is hidden from assistive technology because the words beside it
  // carry the same information in a form that can be read. Announcing both is noise.
  it('states the whole room in words alongside the picture', () => {
    render(<Room state={state({ character: 'flattened' })} />)

    expect(screen.getByTestId('room-text-equivalent')).toHaveTextContent(/flattened/i)
    expect(screen.getByTestId('room-scene')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an empty room without throwing', () => {
    expect(() => render(<Room state={state()} />)).not.toThrow()
  })
})
