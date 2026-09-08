import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

function Probe() {
  return <p data-testid="answer">{useReducedMotion() ? 'reduced' : 'full'}</p>
}

const withPreference = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('useReducedMotion', () => {
  it('reports the preference when it is set', () => {
    withPreference(true)
    render(<Probe />)

    expect(screen.getByTestId('answer')).toHaveTextContent('reduced')
  })

  it('reports full motion when it is not', () => {
    withPreference(false)
    render(<Probe />)

    expect(screen.getByTestId('answer')).toHaveTextContent('full')
  })

  // Older browsers, and any environment without it. Assuming matchMedia exists would
  // take the whole app down rather than degrade.
  it('assumes full motion where the browser cannot say', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<Probe />)

    expect(screen.getByTestId('answer')).toHaveTextContent('full')
  })
})
