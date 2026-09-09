import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkTelegram } from './LinkTelegram'

const data = {
  hasTelegramLink: vi.fn(),
  requestLinkCode: vi.fn(),
  unlinkTelegram: vi.fn(),
}

vi.mock('../../data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasTelegramLink: () => data.hasTelegramLink(),
  requestLinkCode: () => data.requestLinkCode(),
  unlinkTelegram: () => data.unlinkTelegram(),
}))

const offer = { ok: true, code: 'ABC23456', url: 'https://t.me/codenection_bot?start=ABC23456' }

beforeEach(() => {
  data.hasTelegramLink.mockReset().mockResolvedValue(false)
  data.requestLinkCode.mockReset().mockResolvedValue(offer)
  data.unlinkTelegram.mockReset().mockResolvedValue({ ok: true })
})

const settled = () => screen.findByRole('button')

describe('LinkTelegram, not yet linked', () => {
  it('offers to link, and shows no code until asked', async () => {
    render(<LinkTelegram />)

    expect(await screen.findByRole('button', { name: /link telegram/i })).toBeVisible()
    expect(screen.queryByText('ABC23456')).toBeNull()
  })

  it('shows the code once asked for', async () => {
    render(<LinkTelegram />)
    await settled()

    await userEvent.click(screen.getByRole('button', { name: /link telegram/i }))

    expect(await screen.findByText('ABC23456')).toBeVisible()
  })

  // Tapping the link is the point. A student on a phone should not have to retype anything.
  it('offers a link that opens the bot with the code in it', async () => {
    render(<LinkTelegram />)
    await settled()

    await userEvent.click(screen.getByRole('button', { name: /link telegram/i }))

    const link = await screen.findByRole('link', { name: /open telegram/i })
    expect(link).toHaveAttribute('href', offer.url)
  })

  it('reports a failure where every other failure appears', async () => {
    data.requestLinkCode.mockResolvedValue({ ok: false, message: 'Could not reach the server.' })
    render(<LinkTelegram />)
    await settled()

    await userEvent.click(screen.getByRole('button', { name: /link telegram/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i)
  })

  // Two codes in flight would leave the student holding one the database has replaced.
  it('cannot be asked twice at once', async () => {
    let release = () => undefined as void
    data.requestLinkCode.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(offer)
      }),
    )
    render(<LinkTelegram />)
    await settled()

    await userEvent.click(screen.getByRole('button', { name: /link telegram/i }))

    expect(screen.getByRole('button', { name: /link telegram/i })).toBeDisabled()
    release()
  })
})

describe('LinkTelegram, already linked', () => {
  beforeEach(() => {
    data.hasTelegramLink.mockResolvedValue(true)
  })

  it('says so, and offers to unlink', async () => {
    render(<LinkTelegram />)

    expect(await screen.findByRole('button', { name: /unlink/i })).toBeVisible()
  })

  it('returns to the offer once unlinked', async () => {
    render(<LinkTelegram />)

    await userEvent.click(await screen.findByRole('button', { name: /unlink/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /link telegram/i })).toBeVisible(),
    )
  })

  it('reports a failed unlink rather than pretending it worked', async () => {
    data.unlinkTelegram.mockResolvedValue({ ok: false, message: 'Could not reach the server.' })
    render(<LinkTelegram />)

    await userEvent.click(await screen.findByRole('button', { name: /unlink/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach/i)
    expect(screen.getByRole('button', { name: /unlink/i })).toBeVisible()
  })
})
