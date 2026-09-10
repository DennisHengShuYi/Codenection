import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createLocalRepository } from '../data'
import { HORIZON_DAYS } from '../engine'
import type { Schedule } from '../optimizer'
import { RoomShell } from './room/RoomShell'

/** A real repository rather than a stand-in: several of these cases are *about* the
 *  interaction with storage, and a stand-in would only verify the test's own
 *  assumptions. Each test gets its own, so one test's saved week cannot decide another's
 *  result. */
const renderHome = () => {
  const repository = createLocalRepository()
  render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)
  return repository
}

/**
 * §3: `RoomShell` is routing and data now -- the eleven-case `contentFor` switch is gone,
 * and every feature it used to hold inline is owned by the component the room now routes
 * to. What belongs here is the routing itself, plus the app-level behaviour that has no
 * other home: the loading sentence, and resilience when storage cannot be reached.
 */
describe('RoomShell', () => {
  // §0: no cold start. The first thing a new student sees is a real week, not a blank
  // state and not a spinner that never resolves.
  it('shows the room on first run with no saved data', async () => {
    renderHome()

    await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    expect(screen.getByTestId('room-text-equivalent')).toBeVisible()
  })

  describe('routing', () => {
    it('opens the week and comes back to the room', async () => {
      renderHome()
      await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())

      await userEvent.click(screen.getByTestId('open-week'))
      expect(screen.getByTestId('week-back')).toBeVisible()

      await userEvent.click(screen.getByTestId('week-back'))
      await waitFor(() => expect(screen.queryByTestId('week-back')).toBeNull())
      expect(screen.getByTestId('room-scene')).toBeVisible()
    })

    it('opens add as a sheet over the room and closes back to it', async () => {
      renderHome()
      await waitFor(() => expect(screen.getByTestId('open-add')).toBeVisible())

      await userEvent.click(screen.getByTestId('open-add'))
      expect(await screen.findByRole('dialog', { name: /what's coming at you/i })).toBeVisible()

      await userEvent.click(screen.getByRole('button', { name: /close/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('opens settings as a sheet and closes back to the room', async () => {
      renderHome()
      await waitFor(() => expect(screen.getByTestId('open-settings')).toBeVisible())

      await userEvent.click(screen.getByTestId('open-settings'))
      expect(await screen.findByRole('dialog', { name: /settings/i })).toBeVisible()

      await userEvent.click(screen.getByRole('button', { name: /close/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    /**
     * Ruling 16's first behavioural RED: closing a block sheet must return to the week it
     * was opened from, not the room. Proven against `view.ts`'s own tests already (both
     * REDs are reported there); this proves the same contract holds through the real
     * screen, with a real block to open.
     */
    it('closing a block returns to the week, not the room', async () => {
      const repository = createLocalRepository('roomshell-block-back')
      await repository.clear()
      const { HORIZON_DAYS } = await import('../engine')
      await repository.saveWeek({
        items: [
          {
            id: 'essay',
            title: 'Essay draft',
            type: 'mental',
            kind: 'studyBlock',
            hours: 2,
            intensity: 1,
            dayIndex: 5,
            startHour: 10,
            fixed: false,
            deadlineDay: null,
            protectedRest: false,
          },
        ],
        start: { mental: 70, physical: 70, social: 70, errands: 70 },
        horizonDays: HORIZON_DAYS,
        sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
      })
      render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

      await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
      await userEvent.click(screen.getByTestId('open-week'))
      await userEvent.click(await screen.findByTestId('day-5'))
      await userEvent.click(await screen.findByTestId('block-essay'))
      expect(await screen.findByRole('dialog', { name: /essay draft/i })).toBeVisible()

      await userEvent.click(screen.getByRole('button', { name: /close/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      // Back in the week, not the room -- the day grid and Rebalance are still on screen.
      expect(screen.getByTestId('week-back')).toBeVisible()
      expect(screen.queryByTestId('room-scene')).toBeNull()
    })
  })

  describe('rebalance, reached through the week', () => {
    /**
     * The solve is genuinely slow -- over a second on a laptop and several on CI, which is
     * roughly phone-class hardware. The button must go into a working state that the
     * browser has actually painted before the solver takes the main thread.
     */
    it('shows it is working before the solver takes the main thread', async () => {
      renderHome()
      await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
      fireEvent.click(screen.getByTestId('open-week'))

      // fireEvent rather than userEvent, deliberately: userEvent awaits and flushes the
      // pending timer, so the whole solve finishes before it returns and the working state
      // has already been cleared. fireEvent stops at the handler's first await.
      fireEvent.click(await screen.findByTestId('rebalance'))

      expect(screen.getByTestId('rebalance')).toBeDisabled()
      await screen.findByTestId('rebalance-report', undefined, { timeout: 20_000 })
      expect(screen.getByTestId('rebalance')).toBeEnabled()
    }, 30_000)

    it('reports what a rebalance changed, in specifics', async () => {
      renderHome()
      await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
      await userEvent.click(screen.getByTestId('open-week'))

      await userEvent.click(screen.getByTestId('rebalance'))

      const report = await screen.findByTestId('rebalance-report')
      // §2.1: never "optimised" -- a claim the app cannot justify to the person who has to
      // live with the week.
      expect(report).not.toHaveTextContent(/optimis|optimiz/i)
    }, 30_000)

    it('saves the rebalanced week so it survives a reload', async () => {
      const repository = renderHome()
      await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
      await userEvent.click(screen.getByTestId('open-week'))

      await userEvent.click(screen.getByTestId('rebalance'))

      await waitFor(async () => expect(await repository.loadWeek()).not.toBeNull())
    }, 30_000)
  })

  describe('a fortnight the app cannot locate the student within', () => {
    /**
     * §6.5/`calendar.ts`'s own rule: `todayIndex` returns `null` on purpose for a week
     * whose fortnight has already elapsed, rather than guessing. Collapsing that to day 0
     * (the old `?? 0` fallback) would re-mark every genuinely silent day as checked in and
     * point the whole room at the wrong day. The honest surface is to say so, the same way
     * the app already says so while it is still loading.
     */
    it('says it cannot place the day, rather than silently assuming day zero', async () => {
      const repository = createLocalRepository('roomshell-elapsed-fortnight')
      await repository.clear()

      const longAgo = new Date(Date.now() - (HORIZON_DAYS + 10) * 24 * 60 * 60 * 1000)
      const startedOn = longAgo.toISOString().split('T')[0]

      const elapsed: Schedule = {
        items: [],
        start: { mental: 70, physical: 70, social: 70, errands: 70 },
        horizonDays: HORIZON_DAYS,
        sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
        startedOn,
      }
      await repository.saveWeek(elapsed)

      render(<RoomShell repository={repository} blockLog={[]} onAnswerBlock={vi.fn()} />)

      await waitFor(() => expect(screen.getByTestId('day-unlocated')).toBeVisible())
      expect(screen.queryByTestId('room-scene')).toBeNull()
    })
  })

  describe('resilience', () => {
    /**
     * The Supabase adapter throws on every error, so with it configured and the network
     * down a student would be left staring at the loading sentence forever. Falling back to
     * the seeded week is worse than their real data and far better than a screen that never
     * resolves.
     */
    it('still shows a week when storage cannot be read', async () => {
      const broken = {
        loadWeek: () => Promise.reject(new Error('network down')),
        saveWeek: () => Promise.reject(new Error('network down')),
        loadSettings: () => Promise.reject(new Error('network down')),
        saveSettings: () => Promise.reject(new Error('network down')),
        loadBlockLog: () => Promise.reject(new Error('network down')),
        recordBlockAnswer: () => Promise.reject(new Error('network down')),
        clear: () => Promise.reject(new Error('network down')),
      }

      render(<RoomShell repository={broken} blockLog={[]} onAnswerBlock={vi.fn()} />)

      await waitFor(() => expect(screen.getByTestId('room-scene')).toBeVisible())
    })

    it('does not fall over when saving fails', async () => {
      const readOnly = {
        loadWeek: () => Promise.resolve(null),
        saveWeek: () => Promise.reject(new Error('network down')),
        loadSettings: () => Promise.resolve({ lowEnergyOverride: 'auto' as const }),
        saveSettings: () => Promise.reject(new Error('network down')),
        loadBlockLog: () => Promise.resolve([]),
        recordBlockAnswer: () => Promise.reject(new Error('network down')),
        clear: () => Promise.resolve(),
      }

      render(<RoomShell repository={readOnly} blockLog={[]} onAnswerBlock={vi.fn()} />)
      await waitFor(() => expect(screen.getByTestId('open-week')).toBeVisible())
      await userEvent.click(screen.getByTestId('open-week'))
      await userEvent.click(screen.getByTestId('rebalance'))

      // The rebalance still shows on screen even though it could not be persisted.
      expect(await screen.findByTestId('rebalance-report')).toBeVisible()
    }, 30_000)
  })
})
