import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar', () => {
  it('shows the picture when there is one', () => {
    render(<Avatar email="ada@um.edu.my" name="Ada Lovelace" avatarUrl="https://pic/ada.jpg" />)

    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://pic/ada.jpg')
  })

  // Every email and password account is this case, so it is the common one rather than
  // the exception.
  it('shows an initial when there is no picture', () => {
    render(<Avatar email="ada@um.edu.my" />)

    expect(screen.getByText('A')).toBeVisible()
    expect(screen.queryByRole('img')).toBeNull()
  })

  /**
   * A Google photo address can expire, 404, or be blocked by an extension. Leaving a broken
   * image in the corner of the screen looks like the app is broken, so a failure falls back
   * to the same initial as having no picture at all.
   */
  it('falls back to the initial when the picture fails to load', () => {
    render(<Avatar email="ada@um.edu.my" name="Ada Lovelace" avatarUrl="https://pic/gone.jpg" />)

    fireEvent.error(screen.getByRole('img'))

    expect(screen.getByText('A')).toBeVisible()
    expect(screen.queryByRole('img')).toBeNull()
  })

  // A screen reader should say who is signed in, not read out an image address.
  it('is announced as the person it belongs to', () => {
    render(<Avatar email="ada@um.edu.my" name="Ada Lovelace" avatarUrl="https://pic/ada.jpg" />)

    expect(screen.getByRole('img')).toHaveAccessibleName(/ada lovelace/i)
  })

  it('falls back to the address when there is no name to announce', () => {
    render(<Avatar email="ada@um.edu.my" avatarUrl="https://pic/ada.jpg" />)

    expect(screen.getByRole('img')).toHaveAccessibleName(/ada@um\.edu\.my/i)
  })

  // An account with neither a name nor a usable address must still render something rather
  // than an empty circle.
  it('shows a neutral mark when there is nothing to take an initial from', () => {
    render(<Avatar email="" />)

    expect(screen.getByTestId('avatar')).toBeVisible()
  })
})
