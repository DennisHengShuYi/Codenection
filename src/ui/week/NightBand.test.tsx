import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { nightWindow } from '../../domain/nightWindow'
import { NightBand } from './NightBand'

/**
 * The night at the foot of the day, which is where a night belongs.
 *
 * Not a row on the hour grid: a night is the boundary BETWEEN two days rather than something
 * inside one, and `sleepByDay[d]` already means the night at the end of day d. So it is drawn
 * once, under the day it ends, outside that day's hour axis -- which is why 23:00 to 07:00
 * needs no second column and the grid needs no eight empty rows.
 */
describe('NightBand', () => {
  it('names the night and the window it covers', () => {
    render(<NightBand night={nightWindow(7, 8)} lostHours={0} />)

    expect(screen.getByTestId('night-band')).toHaveTextContent('23:00 → 07:00')
    expect(screen.getByTestId('night-band')).toHaveTextContent('8 hours')
  })

  it('says one hour in the singular', () => {
    render(<NightBand night={nightWindow(7, 1)} lostHours={0} />)

    expect(screen.getByTestId('night-band')).toHaveTextContent('1 hour')
    expect(screen.getByTestId('night-band')).not.toHaveTextContent('1 hours')
  })

  /**
   * The bite, which is the whole reason the night is drawn at all. The forecast already says
   * a day will cost hours of sleep; this is the picture behind that sentence.
   */
  it('marks the hours the day is likely to take', () => {
    render(<NightBand night={nightWindow(7, 8)} lostHours={2} />)

    expect(screen.getByTestId('night-lost')).toHaveTextContent('2 hours')
  })

  /** Checked by absence rather than empty text: an element rendered with nothing in it still
   *  takes up space and is still announced. */
  it('marks nothing when the day fits', () => {
    render(<NightBand night={nightWindow(7, 8)} lostHours={0} />)

    expect(screen.queryByTestId('night-lost')).toBeNull()
  })

  /**
   * A day cannot take more of a night than the night has. Without the cap the drawn portion
   * runs past the band and the sentence claims more hours than exist.
   */
  it('takes no more than the night holds', () => {
    render(<NightBand night={nightWindow(7, 6)} lostHours={99} />)

    expect(screen.getByTestId('night-lost')).toHaveTextContent('6 hours')
  })

  /** §8.2: it states and never scolds. This sits beside a number a student has probably
   *  already lost, which is exactly where copy drifts into telling them off. */
  it('does not reproach the student', () => {
    render(<NightBand night={nightWindow(7, 8)} lostHours={2} />)

    const said = screen.getByTestId('night-band').textContent?.toLowerCase() ?? ''

    for (const word of ['should', 'need to', 'must', 'try to', 'only', 'fail']) {
      expect(said).not.toContain(word)
    }
  })

  it('says so when there is no night at all', () => {
    render(<NightBand night={nightWindow(7, 0)} lostHours={0} />)

    expect(screen.getByTestId('night-band')).toHaveTextContent('no night at all')
  })
})
