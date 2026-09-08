import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useTidyUp } from './useTidyUp'

function Probe({ reducedMotion }: { reducedMotion: boolean }) {
  const { tidying, play } = useTidyUp(reducedMotion)

  return (
    <>
      <p data-testid="state">{tidying ? 'tidying' : 'still'}</p>
      <button type="button" onClick={play}>
        play
      </button>
    </>
  )
}

describe('useTidyUp', () => {
  it('starts still', () => {
    render(<Probe reducedMotion={false} />)

    expect(screen.getByTestId('state')).toHaveTextContent('still')
  })

  it('plays the sequence when asked', async () => {
    render(<Probe reducedMotion={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'play' }))

    expect(screen.getByTestId('state')).toHaveTextContent('tidying')
  })

  /**
   * §1.5 requires reduced motion to leave the app fully functional, so the sequence is
   * skipped entirely rather than shortened -- everything it would have shown is simply
   * shown in its final state.
   */
  it('does not play at all when reduced motion is asked for', async () => {
    render(<Probe reducedMotion />)

    await userEvent.click(screen.getByRole('button', { name: 'play' }))

    expect(screen.getByTestId('state')).toHaveTextContent('still')
  })

  // A sequence in flight must not set state on a component that has gone.
  it('cleans up when it goes away mid-sequence', async () => {
    const { unmount } = render(<Probe reducedMotion={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'play' }))

    expect(() => unmount()).not.toThrow()
  })
})
