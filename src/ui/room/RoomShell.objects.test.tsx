import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../../data'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'
import { RoomShell } from './RoomShell'

/**
 * This file used to prove that every one of the room's twelve tap targets opened onto
 * something rather than a dead end -- the failure mode of an object drawn, named, and
 * wired to nothing. A display-only room has no such targets left (§3, §11's "tap any
 * object" deviation). Its replacement is the single remaining point where several
 * destinations converge behind one control: the `+` sheet's three ways in, none buried
 * behind another (§6). `AddSheet` does not exist as its own file yet -- Task 14 gives it
 * one -- so this is that same contract, proven through the stub `RoomShell` renders today.
 */
const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

let counter = 0

const openAdd = async () => {
  counter += 1
  const repository = createLocalRepository(`objects-${counter}`)
  await repository.clear()
  await repository.saveWeek(week())

  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())
  await userEvent.click(screen.getByTestId('open-add'))

  return repository
}

describe('RoomShell, the add sheet', () => {
  it('offers all three ways in together, none buried behind another', async () => {
    await openAdd()

    expect(screen.getByTestId('add-photo')).toBeVisible()
    expect(screen.getByTestId('add-type')).toBeVisible()
    expect(screen.getByTestId('add-request')).toBeVisible()
  })

  it('the photograph way opens the photo importer', async () => {
    await openAdd()

    await userEvent.click(screen.getByTestId('add-photo'))

    expect(screen.getByTestId('photo-input')).toBeVisible()
  })

  it('the typing way opens the planner', async () => {
    await openAdd()

    await userEvent.click(screen.getByTestId('add-type'))

    expect(screen.getByLabelText(/on your mind/i)).toBeVisible()
  })

  it('the request way opens the request box', async () => {
    await openAdd()

    await userEvent.click(screen.getByTestId('add-request'))

    expect(screen.getByLabelText(/what.*asked/i)).toBeVisible()
  })

  it('closing the sheet without choosing a way leaves the saved week untouched', async () => {
    const repository = await openAdd()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await repository.loadWeek())?.items).toHaveLength(0)
  })

  // Escape leaves the sheet too -- carried over from `Sheet`'s own Escape handler.
  it('escape leaves the sheet', async () => {
    await openAdd()

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
