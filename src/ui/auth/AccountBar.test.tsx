import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccountBar } from './AccountBar'

const session = { userId: 'u1', email: 'ada@um.edu.my' }

describe('AccountBar', () => {
  // A name is what a person calls themselves; an address is what a database calls them.
  it('shows the name when Google supplied one', () => {
    render(<AccountBar session={{ ...session, name: 'Ada Lovelace' }} />)

    expect(screen.getByText('Ada Lovelace')).toBeVisible()
  })

  // Unchanged for every email and password account, which is what most of them are.
  it('shows the address when there is no name', () => {
    render(<AccountBar session={session} />)

    expect(screen.getByText('ada@um.edu.my')).toBeVisible()
  })

  it('shows an avatar either way', () => {
    const { rerender } = render(<AccountBar session={session} />)
    expect(screen.getByTestId('avatar')).toBeVisible()

    rerender(
      <AccountBar session={{ ...session, name: 'Ada Lovelace', avatarUrl: 'https://pic/ada.jpg' }} />,
    )
    expect(screen.getByTestId('avatar')).toBeVisible()
  })

  // Sign-out moved to the settings sheet's pinned action bar (§0.2) -- it is no longer this
  // component's responsibility, so there is no button here to click.
  it('renders no sign-out control of its own', () => {
    render(<AccountBar session={session} />)

    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
  })
})
