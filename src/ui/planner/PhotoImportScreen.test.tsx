import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoImportScreen } from './PhotoImportScreen'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule } from '../../optimizer'

/**
 * A fortnight with no `startedOn`, which is the ordinary state of a seeded week.
 *
 * `DayPicker` falls back to the named days there, so these tests still drive the same
 * control they always did -- the day NAMES this file used to pass in are now derived from
 * the week rather than handed over, which is the whole point of the change.
 */
const WEEK: Schedule = {
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
}

const good = {
  items: [
    { title: 'WIA3001 report', type: 'mental', kind: 'studyBlock', hours: 8, deadlineDay: 9, hard: true },
    {
      title: 'Group presentation',
      type: 'social',
      kind: 'socialDraining',
      hours: 3,
      deadlineDay: 5,
      hard: true,
    },
  ],
}

const respondWith = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) }),
  )

const photo = () => new File([new Uint8Array(64)], 'brief.jpg', { type: 'image/jpeg' })

// Unavailable by default, which is the state a judge on a laptop with no key would meet.
beforeEach(() => respondWith(503, {}))
afterEach(() => vi.unstubAllGlobals())

const setup = () => {
  const props = {
    onAccept: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    schedule: WEEK,
    today: 0,
    // Ruling 44: which real day day 0 is, for the reader rather than for the screen.
    calendar: { today: 0, startWeekday: 5, todayLabel: '11 September 2026' },
  }
  render(<PhotoImportScreen {...props} />)
  return props
}

const choose = async (file: File = photo()) => {
  await userEvent.upload(screen.getByTestId('photo-input'), file)
}

describe('PhotoImportScreen', () => {
  it('starts with nothing read and nothing to accept', () => {
    setup()

    expect(screen.queryByRole('button', { name: /add these/i })).toBeNull()
  })

  it('turns a photo into chips', async () => {
    respondWith(200, good)
    setup()

    await choose()

    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))
  })

  /**
   * §1.4's confirm rule matters more here than in the planner. A student wrote their own
   * brain dump and remembers it; they may never have read the brief closely, so a misread
   * deadline is both likelier and less likely to be caught.
   */
  it('shows the photo beside what it read', async () => {
    respondWith(200, good)
    setup()

    await choose()

    await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeVisible())
  })

  // An unlabelled image is invisible to anyone not looking at it. §1.5 holds the room to
  // this standard already.
  it('describes the photo for a screen reader rather than leaving it unlabelled', async () => {
    respondWith(200, good)
    setup()

    await choose()

    await waitFor(() =>
      expect(screen.getByTestId('photo-preview')).toHaveAccessibleName(/photo/i),
    )
  })

  it('accepts nothing until the student says so', async () => {
    respondWith(200, good)
    const props = setup()

    await choose()
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    expect(props.onAccept).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ title: 'WIA3001 report' })]),
    )
  })

  it('drops an item the student removed', async () => {
    respondWith(200, good)
    const props = setup()

    await choose()
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!)
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Group presentation' }),
    ])
  })

  it('keeps a correction the student made to a chip', async () => {
    respondWith(200, good)
    const props = setup()

    await choose()
    await waitFor(() => expect(screen.getAllByTestId(/^chip-/)).toHaveLength(2))

    await userEvent.selectOptions(screen.getAllByLabelText(/kind/i)[0]!, 'errands')
    await userEvent.click(screen.getByRole('button', { name: /add these/i }))

    expect(props.onAccept).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'errands' })]),
    )
  })

  // The honest-refusal design, at the surface a student actually meets.
  it('explains itself when reading a photo is not available', async () => {
    setup()

    await choose()

    expect(await screen.findByTestId('photo-problem')).toHaveTextContent(/type it out/i)
  })

  /**
   * Shown even when the reading failed: seeing the shot is how a student tells a blurry
   * photo from a missing key. It only works if the preview does not depend on the reading
   * having succeeded.
   */
  it('still shows the photo when the reading failed', async () => {
    setup()

    await choose()

    expect(await screen.findByTestId('photo-preview')).toBeVisible()
  })

  /**
   * `applyAccept: false` deliberately bypasses the input's `accept="image/*"`, because that
   * attribute is what this case has to get past to be worth testing: a picker that honours
   * it never delivers a PDF, but a drag-drop, a misreporting file manager or a browser that
   * ignores the hint all can. The guard exists for those, so the test has to reach it.
   */
  it('says so when the file is not a photo at all', async () => {
    setup()

    await userEvent.upload(
      screen.getByTestId('photo-input'),
      new File([new Uint8Array(64)], 'brief.pdf', { type: 'application/pdf' }),
      { applyAccept: false },
    )

    expect(await screen.findByTestId('photo-problem')).toHaveTextContent(/photo/i)
  })

  it('says when it found nothing to do in the photo', async () => {
    respondWith(200, { items: [] })
    setup()

    await choose()

    expect(await screen.findByText(/could not find anything/i)).toBeVisible()
  })

  /**
   * Ruling 60 split the one `Cancel` into two: Back goes up to the chooser, close is done
   * with the whole thing. Both are the container's own controls now, so both are asserted
   * here -- the screen's job is only to hand them somewhere to go.
   */
  it('can be stepped back to the chooser without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByTestId('sheet-back'))

    expect(props.onBack).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onAccept).not.toHaveBeenCalled()
  })

  it('can be closed outright without accepting anything', async () => {
    const props = setup()

    await userEvent.click(screen.getByRole('button', { name: /close/i }))

    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onBack).not.toHaveBeenCalled()
    expect(props.onAccept).not.toHaveBeenCalled()
  })
})

/**
 * Ruling 44's last reader. The planner and the request box were told what today is; this screen
 * was not, so a timetable saying "Tuesday" still had its day guessed at -- in the one path
 * where nearly every item is a weekday.
 */
describe('the calendar handed to the photo reader', () => {
  it('sends the week it is importing into, with the photo', async () => {
    let body = ''
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        body = String(init.body)
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(good) })
      }),
    )

    const props = setup()
    await choose()

    await waitFor(() => expect(body).not.toBe(''))
    expect(JSON.parse(body).calendar).toEqual(props.calendar)
  })
})
