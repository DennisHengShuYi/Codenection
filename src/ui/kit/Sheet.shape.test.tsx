import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'

/**
 * The shape of the container every button opens, as opposed to what goes inside it.
 *
 * `Sheet.test.tsx` next door covers the contract -- dialog semantics, focus, Escape, where
 * actions land. This file covers what Ruling 58 changed: the panel is sized to what it
 * holds rather than to the viewport, it sits over a real backdrop that can be clicked away,
 * and the page behind it stops scrolling while it is open. The settings sheet -- three
 * radios and one sentence -- used to occupy most of a 1440x900 screen, two thirds of it
 * blank.
 */
const setup = () => {
  const onClose = vi.fn()
  render(
    <Sheet title="FYP meeting" onClose={onClose}>
      <p>14:00-16:00</p>
    </Sheet>,
  )
  return { onClose }
}

describe('the sheet as an object on the screen', () => {
  it('sits over a backdrop, so the room behind it is dimmed rather than covered', () => {
    setup()

    const backdrop = screen.getByTestId('sheet-backdrop')

    expect(backdrop).toContainElement(screen.getByRole('dialog'))
    expect(backdrop.className).toContain('fixed')
    expect(backdrop.className).toContain('inset-0')
  })

  /**
   * The panel is only as tall as it needs to be, capped so a long body still fits on the
   * screen. `md:inset-y-8` -- the old geometry -- made every sheet the height of the
   * viewport whatever it held, which is the fault being fixed.
   */
  it('is sized to its content rather than to the viewport', () => {
    setup()

    const panel = screen.getByRole('dialog')

    expect(panel.className).toContain('md:max-w-lg')
    expect(panel.className).toContain('md:max-h-')
    expect(panel.className).not.toContain('md:inset-y-8')
  })

  /** Below 768px a brain-dump box squeezed into a card is unusable, so the panel still
   *  takes the whole phone. */
  it('still takes the whole screen on a phone', () => {
    setup()

    expect(screen.getByRole('dialog').className).toContain('h-dvh')
    expect(screen.getByRole('dialog').className).toContain('md:h-auto')
  })

  it('closes when the backdrop is clicked, the way Escape already closes it', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByTestId('sheet-backdrop'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stays open when the click lands inside the panel', async () => {
    const { onClose } = setup()

    await userEvent.click(screen.getByText('14:00-16:00'))

    expect(onClose).not.toHaveBeenCalled()
  })

  /**
   * A drag that starts on a word inside the panel and releases outside it is a student
   * selecting text, not asking to close. The browser reports that release as a click on the
   * backdrop, so a naive handler throws away whatever they were doing.
   */
  it('stays open when a drag begins inside the panel and ends on the backdrop', async () => {
    const { onClose } = setup()

    const body = screen.getByText('14:00-16:00')
    const backdrop = screen.getByTestId('sheet-backdrop')

    await userEvent.pointer([
      { target: body, keys: '[MouseLeft>]' },
      { target: backdrop },
      { target: backdrop, keys: '[/MouseLeft]' },
    ])

    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops the page behind it scrolling, and lets it go again when it closes', () => {
    const { unmount } = render(
      <Sheet title="FYP meeting" onClose={vi.fn()}>
        <p>14:00-16:00</p>
      </Sheet>,
    )

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })
  /**
   * Ruling 59 put the week's calendar in a sheet. Seven day columns and an hour gutter do
   * not fit the default card, so the container -- not the caller -- owns the second width.
   */
  it('takes a wider card when what it holds needs one', () => {
    render(
      <Sheet title="The week" onClose={vi.fn()} size="wide">
        <p>seven days</p>
      </Sheet>,
    )

    const panel = screen.getByRole('dialog')

    expect(panel.className).toContain('md:max-w-3xl')
    expect(panel.className).not.toContain('md:max-w-lg')
  })
})

/**
 * Ruling 60: two controls with two different jobs.
 *
 * `Cancel` had to mean both "go up one" and "give up entirely", and which one it meant
 * depended on which sheet you were in -- inside a sub-flow it dropped you at the chooser,
 * at the chooser it closed the whole thing. Now Back steps up one level and `x` closes the
 * sheet outright, whatever depth it was opened to.
 *
 * Back is rendered by the container rather than by each caller, so it cannot drift into
 * three slightly different buttons, and it appears ONLY where there is a level above --
 * a sheet opened straight from the room would otherwise carry two controls that do the
 * same thing.
 */
describe('the sheet with somewhere to go back to', () => {
  it('offers Back when it is given somewhere to go, and calls it', async () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    render(
      <Sheet title="Photograph it" onClose={onClose} onBack={onBack}>
        <p>a timetable</p>
      </Sheet>,
    )

    await userEvent.click(screen.getByTestId('sheet-back'))

    expect(onBack).toHaveBeenCalledOnce()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers no Back when there is nothing above it', () => {
    render(
      <Sheet title="Settings" onClose={vi.fn()}>
        <p>how much to show</p>
      </Sheet>,
    )

    expect(screen.queryByTestId('sheet-back')).toBeNull()
  })

  /** The close control is unconditional: it means "I am done with this", not "go up one". */
  it('keeps close closing, with Back beside it rather than instead of it', async () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    render(
      <Sheet title="Photograph it" onClose={onClose} onBack={onBack}>
        <p>a timetable</p>
      </Sheet>,
    )

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('puts Back in the action bar even when the caller passes no actions of its own', () => {
    render(
      <Sheet title="Photograph it" onClose={vi.fn()} onBack={vi.fn()}>
        <p>a timetable</p>
      </Sheet>,
    )

    expect(screen.getByTestId('sheet-actions')).toContainElement(screen.getByTestId('sheet-back'))
  })
})
