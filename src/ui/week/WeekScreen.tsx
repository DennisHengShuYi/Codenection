import { useState } from 'react'
import type { CalibrationProfile } from '../../domain/calibration'
import type { Schedule } from '../../optimizer'
import { Button } from '../kit/Button'
import { dayGrid } from './dayGrid'
import { scheduleView, type LoadBand } from './scheduleView'

/**
 * §4's primary surface: the whole horizon, one day expanded beneath it, and Rebalance.
 *
 * Rebalance sits between the overview and the day grid rather than below both, because it
 * acts on the fortnight rather than on whichever day happens to be open -- if it moved down
 * with the day, a student opening a day to check on it would read Rebalance as scoped to
 * that day instead of the whole week (§4).
 */

const BAND_LABEL: Record<LoadBand, string> = {
  light: 'light',
  busy: 'busy',
  heavy: 'heavy',
}

// §1.5: colour never carries meaning alone. These shades are only ever paired with the band
// word in the button's own accessible name.
const BAND_SHADE: Record<LoadBand, string> = {
  light: 'bg-line/40',
  busy: 'bg-attention/30',
  heavy: 'bg-attention/70',
}

const TYPE_LABEL: Record<string, string> = {
  mental: 'mental',
  physical: 'physical',
  social: 'social',
  errands: 'errands',
}

const TYPE_HUE: Record<string, string> = {
  mental: 'bg-load-mental',
  physical: 'bg-load-physical',
  social: 'bg-load-social',
  errands: 'bg-load-errands',
}

const dayLabel = (dayIndex: number, date: string | null): string => (date === null ? `Day ${dayIndex}` : date)

export function WeekScreen(props: {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  readonly today: number
  readonly working: boolean
  readonly report: string | null
  readonly onRebalance: () => void
  readonly onSelectBlock: (itemId: string) => void
}) {
  const { schedule, profile, today, working, report, onRebalance, onSelectBlock } = props
  const [openDay, setOpenDay] = useState<number | null>(null)

  const cells = scheduleView({ schedule, profile, today })

  const grid = openDay === null ? null : dayGrid(schedule, openDay)

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-2 md:grid-cols-7">
        {cells.map((cell) => {
          const parts = [dayLabel(cell.dayIndex, cell.date), BAND_LABEL[cell.band]]
          if (cell.deficit) parts.push('deficit')
          if (cell.unconfirmed) parts.push('not confirmed')

          return (
            <li key={cell.dayIndex}>
              <button
                type="button"
                data-testid={`day-${cell.dayIndex}`}
                aria-label={parts.join(' — ')}
                aria-pressed={openDay === cell.dayIndex}
                onClick={() => setOpenDay(cell.dayIndex)}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border border-line p-2 text-xs aspect-square md:aspect-auto ${BAND_SHADE[cell.band]}`}
              >
                <span>{dayLabel(cell.dayIndex, cell.date)}</span>
                {cell.deficit && <span aria-hidden="true">⚠</span>}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="flex flex-col gap-2">
        <Button data-testid="rebalance" onClick={onRebalance} disabled={working}>
          {working ? 'Working…' : 'Rebalance'}
        </Button>

        {report !== null && (
          <p data-testid="rebalance-report" role="status" className="text-sm text-ink-soft">
            {report}
          </p>
        )}
      </div>

      {grid !== null && (
        <div
          data-testid="day-grid"
          className="relative mx-auto w-full max-w-2xl rounded-xl border border-line bg-surface"
          style={{ minHeight: `${(grid.hours.length - 1) * 48}px` }}
        >
          {grid.hours.slice(0, -1).map((hour) => (
            <div
              key={hour}
              className="absolute left-0 w-12 border-t border-line text-xs text-ink-soft"
              style={{
                top: `${((hour - grid.firstHour) / (grid.lastHour - grid.firstHour)) * 100}%`,
              }}
            >
              {hour}:00
            </div>
          ))}

          {grid.blocks.map(({ item, topPercent, heightPercent }) => (
            <button
              key={item.id}
              type="button"
              data-testid={`block-${item.id}`}
              onClick={() => onSelectBlock(item.id)}
              className={`absolute left-14 right-2 min-h-11 rounded-lg p-1 text-left text-xs text-white ${TYPE_HUE[item.type]}`}
              style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
            >
              <div>{item.title}</div>
              <div>
                {TYPE_LABEL[item.type]} — {item.startHour}:00–{item.startHour + item.hours}:00
                {item.fixed && ' 🔒 fixed'}
                {item.protectedRest && ' 🛡 protected'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
