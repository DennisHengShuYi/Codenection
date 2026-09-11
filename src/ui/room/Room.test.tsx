import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Room } from './Room'
import { describeRoomFully } from './roomText'
import type { RoomModel } from './roomModel'
import type { RoomState } from './roomState'

const state = (over: Partial<RoomState> = {}): RoomState => ({
  ceilingPressure: 0.2,
  paperHeight: 0.2,
  clutter: [],
  exerciseWaiting: 0, companyWaiting: 0,
  windowDark: 0,
  sleepDebt: 0,
  weather: 'clear',
  lightLevel: 0.8,
  reserve: 0.7,
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

/**
 * CSS 2.1 Appendix E, reduced to the only case the room is: two absolutely positioned
 * siblings inside one stacking context. They paint in ascending z-index, and a tie is
 * broken by document order -- the later element wins. So `over` is genuinely on top only
 * if it out-ranks `under` on z-index, or matches it and comes after it in the tree.
 *
 * This is what five presence-and-text assertions could not say: `toBeInTheDocument` is true
 * of an element painted behind an opaque wall (Ruling 52).
 */
const paintsOver = (over: Element, under: Element): boolean => {
  const depth = (element: Element): number => {
    const declared = window.getComputedStyle(element).zIndex
    return declared === '' || declared === 'auto' ? 0 : Number(declared)
  }

  if (depth(over) !== depth(under)) return depth(over) > depth(under)
  return Boolean(under.compareDocumentPosition(over) & Node.DOCUMENT_POSITION_FOLLOWING)
}

describe('Room', () => {
  // §10: a viewBox and no fixed width is the whole argument for hand-rolling it -- it
  // scales at every breakpoint without a media query.
  it('scales with its container rather than fixing a pixel width', () => {
    render(<Room model={modelOf(state())} frame="inline" />)
    const scene = screen.getByTestId('room-scene')

    expect(scene).toHaveAttribute('viewBox')
    expect(scene).not.toHaveAttribute('width')
  })

  /**
   * The artwork this branch shipped without.
   *
   * `Room.tsx` drew nine bare `<rect>`s on one flat field, which is why the deployed page
   * read as coloured boxes rather than a room. The scene modules give it a wall, a floor
   * and the three pieces of furniture that were specified, drawn but never merged.
   */
  it('draws the building it stands in, not one flat field', () => {
    render(<Room model={modelOf()} frame="inline" />)

    expect(screen.getByTestId('room-wall')).toBeInTheDocument()
    expect(screen.getByTestId('room-floor')).toBeInTheDocument()
  })

  it('draws the desk, the mirror and the phone', () => {
    render(<Room model={modelOf()} frame="inline" />)

    for (const id of ['desk', 'mirror', 'phone']) {
      expect(screen.getByTestId(`room-${id}`)).toBeInTheDocument()
    }
  })

  /**
   * The lamp glow replaces a full-bleed amber wash over the whole scene, which pushed every
   * colour toward beige at exactly the moment the student was doing well. A lit room and a
   * dark one must still be told apart, so the reading is asserted rather than the artwork:
   * more reserve, more glow.
   */
  it('reads the reserve as how lit the room is', () => {
    const { container: dark } = render(<Room model={modelOf(state({ lightLevel: 0.1 }))} frame="inline" />)
    const { container: lit } = render(<Room model={modelOf(state({ lightLevel: 0.9 }))} frame="inline" />)

    const glow = (root: HTMLElement): number =>
      Number(root.querySelector('[data-testid="room-light"] circle')?.getAttribute('opacity'))

    expect(glow(lit)).toBeGreaterThan(glow(dark))
  })

  it('draws all eight objects', () => {
    render(<Room model={modelOf(state({ clutter: [{ id: 'a', title: 'Laundry', dayIndex: 1 }] }))} frame="inline" />)

    for (const id of [
      'ceiling',
      'papers',
      'clutter',
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
        frame="inline"
      />,
    )

    expect(screen.getAllByTestId(/^clutter-box-/)).toHaveLength(2)
  })

  it('lights the door when the state says so', () => {
    render(<Room model={modelOf(state({ doorLit: true }))} frame="inline" />)

    expect(screen.getByTestId('room-door')).toHaveAttribute('data-lit', 'true')
  })

  it('reflects the character state', () => {
    render(<Room model={modelOf(state({ character: 'flattened' }))} frame="inline" />)

    expect(screen.getByTestId('room-character')).toHaveAttribute('data-state', 'flattened')
  })

  // §3: the room is a picture now, not a control surface -- the twelve invisible tap
  // targets that used to sit over the artwork are gone, along with `onSelect`. Every
  // feature they duplicated is reached elsewhere; this just stops the room shouting.
  it('is a picture, not a control surface', () => {
    render(<Room model={modelOf()} frame="inline" />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  // §1.1: the dial moves in as a compact readout, "no tap required for either" -- it used
  // to be two taps deep, behind the light object.
  it('shows the reserve without anybody having to look for it', () => {
    render(<Room model={modelOf()} frame="inline" />)

    expect(screen.getByTestId('room-gauge')).toBeInTheDocument()
  })

  /**
   * Ruling 52. The gauge was in the DOM, carried the right number, and was invisible: the
   * scene `<svg>` is `absolute inset-0`, a later sibling, and neither element declares a
   * z-index -- so the wall rect painted straight over it and nobody had ever seen it.
   *
   * Presence is not visibility. This asserts the stacking relationship instead, which is
   * the thing that was actually wrong, and it fails on the DOM order that shipped.
   */
  it('paints the corner gauge over the room rather than behind its wall', () => {
    render(<Room model={modelOf()} frame="inline" />)
    const gauge = screen.getByTestId('room-gauge')
    const scene = screen.getByTestId('room-scene')

    // Same positioned parent, so one stacking context and the rule above decides.
    expect(gauge.parentElement).toBe(scene.parentElement)
    expect(paintsOver(gauge, scene)).toBe(true)
  })

  /**
   * §45: off the reserve itself, not off the light.
   *
   * The light means the day's spill now, and a gauge derived from it read 100% on a
   * nine-hour day at 43% reserve -- caught by looking at the room, not by a test, which is
   * why this one now names the field it depends on.
   */
  it('reads the reserve as a percentage, whatever the light is doing', () => {
    render(<Room model={modelOf(state({ reserve: 0.42, lightLevel: 0.1 }))} frame="inline" />)

    expect(screen.getByTestId('room-gauge')).toHaveTextContent('42%')
  })

  // §1.5: with no buttons left to carry accessible names, the drawing has to speak for
  // itself -- so it gets the full, uncapped description as its own aria-label rather than
  // staying decorative. Screen-reader users lose nothing that used to live on the buttons.
  it('gives screen reader users everything the drawing shows, not a trimmed version', () => {
    const roomState = state({ character: 'flattened', doorLit: true })
    render(<Room model={modelOf(roomState)} frame="inline" />)

    expect(screen.getByTestId('room-scene')).toHaveAttribute('aria-label', describeRoomFully(roomState))
  })

  it('renders an empty room without throwing', () => {
    expect(() => render(<Room model={modelOf(state())} frame="inline" />)).not.toThrow()
  })
  /**
   * Ruling 59. The gauge was a readout and nothing else; the five-bar breakdown behind it
   * sat at the foot of the week screen, where a student looking for "how am I doing" had no
   * reason to go. The corner readout is now the door to it.
   */
  it('opens the reserves when the gauge is pressed, if it has somewhere to open', async () => {
    const onOpenReserves = vi.fn()
    render(<Room model={modelOf()} frame="inline" onOpenReserves={onOpenReserves} />)

    await userEvent.click(screen.getByTestId('room-gauge'))

    expect(onOpenReserves).toHaveBeenCalledOnce()
  })

  it('names what the gauge opens, rather than reading out as a bare percentage', () => {
    render(<Room model={modelOf(state({ lightLevel: 0.43 }))} frame="inline" onOpenReserves={vi.fn()} />)

    expect(screen.getByTestId('room-gauge')).toHaveAccessibleName(/reserves/i)
  })

  /**
   * `RoomComparison` and the low-energy interface both draw a room with nowhere for the
   * gauge to go. It stays a readout there rather than becoming a button that does nothing.
   */
  it('stays a plain readout when it is given nowhere to open', () => {
    render(<Room model={modelOf()} frame="inline" />)

    expect(screen.getByTestId('room-gauge').tagName).not.toBe('BUTTON')
  })
})

/**
 * §45: the two objects today puts in the room.
 *
 * The drawing is where this feature actually lives -- `roomState` deciding a number means
 * nothing if no shape reads it -- and both of these are new, so nothing else in the suite
 * would notice if they silently stopped rendering.
 */
describe('what today puts in the room', () => {
  it('puts a dumbbell out when exercise is on today', () => {
    render(<Room model={modelOf(state({ exerciseWaiting: 0.5 }))} frame="inline" />)

    expect(screen.getByTestId('room-dumbbell')).toBeInTheDocument()
  })

  it('leaves the floor clear of it when there is none', () => {
    render(<Room model={modelOf(state({ exerciseWaiting: 0 }))} frame="inline" />)

    expect(screen.queryByTestId('room-dumbbell')).toBeNull()
  })

  it('draws a heavier session as a heavier dumbbell, not a second one', () => {
    const { container: light } = render(<Room model={modelOf(state({ exerciseWaiting: 0.2 }))} frame="inline" />)
    const { container: heavy } = render(<Room model={modelOf(state({ exerciseWaiting: 1 }))} frame="inline" />)

    const widthOf = (root: HTMLElement) =>
      Number(root.querySelector('[data-testid="room-dumbbell"] rect')?.getAttribute('width') ?? 0)

    expect(widthOf(heavy)).toBeGreaterThan(widthOf(light))
  })

  it('puts people in the room when company is on today', () => {
    render(<Room model={modelOf(state({ companyWaiting: 0.4 }))} frame="inline" />)

    expect(screen.getByTestId('room-company')).toBeInTheDocument()
  })

  it('leaves it empty of people when none are', () => {
    render(<Room model={modelOf(state({ companyWaiting: 0 }))} frame="inline" />)

    expect(screen.queryByTestId('room-company')).toBeNull()
  })

  /** More time with people is more people -- and capped, because a room with nine figures
   *  in it is a crowd scene rather than a Tuesday. */
  it('adds figures with the hours, up to a crowd it will not exceed', () => {
    const { container: few } = render(<Room model={modelOf(state({ companyWaiting: 0.2 }))} frame="inline" />)
    const { container: many } = render(<Room model={modelOf(state({ companyWaiting: 1 }))} frame="inline" />)

    const figuresIn = (root: HTMLElement) =>
      root.querySelectorAll('[data-testid="room-company"] circle').length

    expect(figuresIn(many)).toBeGreaterThan(figuresIn(few))
    expect(figuresIn(many)).toBeLessThanOrEqual(3)
  })

  /** §45: rest is deliberately not an object. It is the one thing on a day that is not a
   *  duty, and drawing it as another thing waiting would make it one. */
  it('draws nothing for rest', () => {
    const { container } = render(<Room model={modelOf(state())} frame="inline" />)

    expect(container.querySelector('[data-testid="room-rest"]')).toBeNull()
  })

  /** §45's darkness reaches the glass, not just the state. */
  it('darkens the window when the day does not fit', () => {
    render(<Room model={modelOf(state({ windowDark: 0.7 }))} frame="inline" />)

    expect(screen.getByTestId('window-night')).toBeInTheDocument()
  })

  it('leaves the window alone on a day there is room for', () => {
    render(<Room model={modelOf(state({ windowDark: 0 }))} frame="inline" />)

    expect(screen.queryByTestId('window-night')).toBeNull()
  })
})
