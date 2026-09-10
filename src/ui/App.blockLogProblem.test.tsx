import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

const PROBLEM = 'I could not save that answer, so it may not be here next time you open the app.'

/**
 * `useBlockLog` is stubbed rather than driven, because what this file exists to prove is
 * the *wiring*: that a failure the hook reports actually reaches the screen. Driving a real
 * write failure through the week screen would test the hook again -- which
 * `useBlockLog.test.tsx` already does -- and would still leave the one thing that has gone
 * wrong four times on this branch unchecked: a value computed, tested, and never rendered.
 */
vi.mock('./useBlockLog', () => ({
  useBlockLog: () => ({ blockLog: [], recordAnswer: vi.fn(), problem: PROBLEM, retry: vi.fn() }),
}))

describe('App when a block answer cannot be written', () => {
  it('tells the student rather than swallowing it', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )
    await userEvent.click(screen.getByRole('button', { name: /look around/i }))
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

    expect(screen.getByTestId('block-log-problem')).toHaveTextContent(/could not save/i)
  })

  /**
   * The room stage is `h-dvh` and the band inside it is anchored to the stage's bottom with
   * a cap derived from the stage's own height. A sentence rendered ABOVE the stage in normal
   * flow pushes all of that down: the stage runs past the fold, the page gains a scrollbar,
   * and `+` -- the one control low-energy mode keeps -- goes below it. So the notice and the
   * stage have to share one viewport-height column, with the notice taking its space out of
   * the stage rather than out of the screen.
   *
   * Asserted structurally, on the classes that produce it, because jsdom has no layout
   * engine: every `getBoundingClientRect` here is zero, so a measurement would be a test
   * that cannot fail. These are the three declarations the arrangement rests on, and
   * deleting any one of them brings the scrollbar back.
   */
  it('keeps the notice and the room inside one viewport-height column', async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /look around/i })).toBeVisible(),
    )
    await userEvent.click(screen.getByRole('button', { name: /look around/i }))
    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())

    const notice = screen.getByTestId('block-log-problem')
    const stage = screen.getByTestId('room-stage')

    // One parent, so the two really are laid out against each other.
    expect(notice.parentElement).toBe(stage.parentElement)
    // ...and that parent is the column that owns the viewport's height.
    const classesOf = (element: Element | null): readonly string[] =>
      (element?.className ?? '').split(/\s+/)

    expect(classesOf(stage.parentElement)).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'h-dvh']),
    )
    // The stage takes what is left rather than a second full viewport. `min-h-0` is what
    // lets it actually shrink -- without it a flex item refuses to go below its content.
    expect(classesOf(stage)).toEqual(expect.arrayContaining(['flex-1', 'min-h-0']))
    // And the notice does not shrink to nothing to make room for it.
    expect(classesOf(notice)).toContain('shrink-0')
  })
})
