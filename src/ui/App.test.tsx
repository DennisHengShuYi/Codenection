import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

// Deliberately thin: everything of substance is tested one level down in HomeScreen.
// What these catch is the wiring between the two being broken.
describe('App', () => {
  it('renders the home screen', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Codenection'),
    )
  })

  it('reaches a real capacity figure with no saved data', async () => {
    render(<App />)

    await waitFor(() =>
      expect(screen.getByTestId('capacity-value')).toHaveTextContent(/^\d{1,3}%$/),
    )
  })
})
