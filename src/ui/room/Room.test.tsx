import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Room } from './Room'
import { describeRoomFully } from './roomText'
import type { RoomModel } from './roomModel'
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

/**
 * `RoomModel` is `{ state }` and nothing else since the sidebar's `rows` were deleted, so
 * this is a one-line wrapper -- kept as a helper rather than inlined because every case
 * below reads better as `modelOf(state({ ... }))`.
 */
const modelOf = (roomState: RoomState = state()): RoomModel => ({ state: roomState })

describe('Room', () => {
  // §10: a viewBox and no fixed width is the whole argument for hand-rolling it -- it
  // scales at every breakpoint without a media query.
  it('scales with its container rather than fixing a pixel width', () => {
    render(<Room model={modelOf(state())} />)
    const scene = screen.getByTestId('room-scene')

    expect(scene).toHaveAttribute('viewBox')
    expect(scene).not.toHaveAttribute('width')
  })

  it('draws all nine objects', () => {
    render(<Room model={modelOf(state({ clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }] }))} />)

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
        model={modelOf(
          state({
            clutter: [
              { id: 'a', title: 'Laundry', dayIndex: 1 },
              { id: 'b', title: 'Post office', dayIndex: 3 },
            ],
          }),
        )}
      />,
    )

    expect(screen.getAllByTestId(/^clutter-box-/)).toHaveLength(2)
  })

  it('lights the door when the state says so', () => {
    render(<Room model={modelOf(state({ doorLit: true }))} />)

    expect(screen.getByTestId('room-door')).toHaveAttribute('data-lit', 'true')
  })

  it('reflects the character state', () => {
    render(<Room model={modelOf(state({ character: 'flattened' }))} />)

    expect(screen.getByTestId('room-character')).toHaveAttribute('data-state', 'flattened')
  })

  // §3: the room is a picture now, not a control surface -- the twelve invisible tap
  // targets that used to sit over the artwork are gone, along with `onSelect`. Every
  // feature they duplicated is reached elsewhere; this just stops the room shouting.
  it('is a picture, not a control surface', () => {
    render(<Room model={modelOf()} />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  // §1.1: the dial moves in as a compact readout, "no tap required for either" -- it used
  // to be two taps deep, behind the light object.
  it('shows the reserve without anybody having to look for it', () => {
    render(<Room model={modelOf()} />)

    expect(screen.getByTestId('room-gauge')).toBeInTheDocument()
  })

  it('reads the reserve off the light level, as a percentage', () => {
    render(<Room model={modelOf(state({ lightLevel: 0.42 }))} />)

    expect(screen.getByTestId('room-gauge')).toHaveTextContent('42%')
  })

  // §1.5: with no buttons left to carry accessible names, the drawing has to speak for
  // itself -- so it gets the full, uncapped description as its own aria-label rather than
  // staying decorative. Screen-reader users lose nothing that used to live on the buttons.
  it('gives screen reader users everything the drawing shows, not a trimmed version', () => {
    const roomState = state({ character: 'flattened', doorLit: true })
    render(<Room model={modelOf(roomState)} />)

    expect(screen.getByTestId('room-scene')).toHaveAttribute('aria-label', describeRoomFully(roomState))
  })

  it('renders an empty room without throwing', () => {
    expect(() => render(<Room model={modelOf(state())} />)).not.toThrow()
  })
})
