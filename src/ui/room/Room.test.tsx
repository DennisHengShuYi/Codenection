import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Room } from './Room'
import { clutterIdFor, isClutterId, metaFor, OBJECT_ORDER, CLUTTER_PLACEHOLDER } from './objects'
import type { RoomModel, RoomRow } from './roomModel'
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
 * The room now takes the model rather than the raw state, because the controls are driven by
 * the same rows the sidebar uses -- that is what stops the two views drifting. This builds a
 * model around a given state so every assertion below survives the change unaltered.
 */
const modelOf = (roomState: RoomState): RoomModel => ({
  state: roomState,
  rows: OBJECT_ORDER.flatMap((entry): RoomRow[] => {
    if (entry === CLUTTER_PLACEHOLDER) {
      return roomState.clutter.map((box) => ({
        id: clutterIdFor(box.id),
        label: box.title,
        reading: `day ${box.dayIndex}`,
        attention: false,
      }))
    }

    return [
      {
        id: entry,
        label: metaFor(entry).label,
        reading: 'x',
        attention: entry === 'door' ? roomState.doorLit : false,
      },
    ]
  }),
})

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

  // §1.3: "Tap any object for its numbers."
  it('tells anyone who taps an object which one it was', async () => {
    const onSelect = vi.fn()
    render(<Room model={modelOf(state())} onSelect={onSelect} />)

    await userEvent.click(screen.getByTestId('object-plant'))

    expect(onSelect).toHaveBeenCalledWith('plant')
  })

  // A clutter box reports the errand, not "clutter" -- otherwise there is no way to act
  // on the specific thing that was tapped.
  it('reports a clutter box by its own id', async () => {
    const onSelect = vi.fn()
    render(
      <Room
        model={modelOf(state({ clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }] }))}
        onSelect={onSelect}
      />,
    )

    await userEvent.click(screen.getByTestId('object-clutter-a'))

    // Namespaced now, so a clutter box cannot collide with a piece of furniture.
    expect(onSelect).toHaveBeenCalledWith('clutter-a')
  })

  // §1.5: the picture is hidden from assistive technology because the words beside it
  // carry the same information in a form that can be read. Announcing both is noise.
  /**
   * §1.5's text equivalent has moved to the sidebar, which is the words view -- see
   * RoomSidebar.test.tsx, where this assertion now lives. It is not lost, and it is not
   * weaker: the sidebar states the room in words *and* lets you operate it, where this
   * paragraph only described a picture.
   *
   * What stays here is that the drawing itself remains decorative, so it is not announced
   * twice.
   */
  it('keeps the drawing decorative, since the words live in the sidebar', () => {
    render(<Room model={modelOf(state({ character: 'flattened' }))} />)

    expect(screen.getByTestId('room-scene')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders an empty room without throwing', () => {
    expect(() => render(<Room model={modelOf(state())} />)).not.toThrow()
  })
})
