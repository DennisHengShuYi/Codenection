import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNarrowViewport } from './useNarrowViewport'

function Probe() {
  return <p data-testid="answer">{useNarrowViewport() ? 'narrow' : 'wide'}</p>
}

const atWidth = (matches: boolean) => {
  const query = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(query))
  return query
}

afterEach(() => vi.unstubAllGlobals())

/**
 * A media query read in JavaScript, which the app otherwise avoids.
 *
 * It exists because what it decides is an SVG `viewBox` -- an attribute, not a style, and
 * there is no CSS that sets one. The room is framed more tightly on a phone so the furniture
 * is not left a band across the top third, and framing cannot be a utility class.
 */
describe('useNarrowViewport', () => {
  it('says narrow on a phone-width screen', () => {
    atWidth(true)
    render(<Probe />)

    expect(screen.getByTestId('answer')).toHaveTextContent('narrow')
  })

  it('says wide above the breakpoint', () => {
    atWidth(false)
    render(<Probe />)

    expect(screen.getByTestId('answer')).toHaveTextContent('wide')
  })

  /**
   * Wide is the safe default, and deliberately so: it is the framing that crops nothing. A
   * browser or test environment that cannot answer gets the whole room rather than a guess
   * at a crop, and the app keeps running either way.
   */
  it('assumes wide where the browser cannot say', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<Probe />)

    expect(screen.getByTestId('answer')).toHaveTextContent('wide')
  })

  /** Rotating a phone changes the answer, so the query is listened to rather than sampled
   *  once and remembered. */
  it('subscribes to changes rather than reading once', () => {
    const query = atWidth(true)
    render(<Probe />)

    expect(query.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('stops listening when it goes away', () => {
    const query = atWidth(true)
    const { unmount } = render(<Probe />)

    unmount()

    expect(query.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
