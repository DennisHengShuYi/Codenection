import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountBar } from './AccountBar'

const session = { userId: 'u1', email: 'ada@um.edu.my' }

describe('AccountBar', () => {
  // A name is what a person calls themselves; an address is what a database calls them.
  it('shows the name when Google supplied one', () => {
    render(<AccountBar session={{ ...session, name: 'Ada Lovelace' }} onSignOut={() => undefined} />)

    expect(screen.getByText('Ada Lovelace')).toBeVisible()
  })

  // Unchanged for every email and password account, which is what most of them are.
  it('shows the address when there is no name', () => {
    render(<AccountBar session={session} onSignOut={() => undefined} />)

    expect(screen.getByText('ada@um.edu.my')).toBeVisible()
  })

  it('shows an avatar either way', () => {
    const { rerender } = render(<AccountBar session={session} onSignOut={() => undefined} />)
    expect(screen.getByTestId('avatar')).toBeVisible()

    rerender(
      <AccountBar
        session={{ ...session, name: 'Ada Lovelace', avatarUrl: 'https://pic/ada.jpg' }}
        onSignOut={() => undefined}
      />,
    )
    expect(screen.getByTestId('avatar')).toBeVisible()
  })

  it('still signs out', async () => {
    const onSignOut = vi.fn()
    render(<AccountBar session={session} onSignOut={onSignOut} />)

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }))

    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
