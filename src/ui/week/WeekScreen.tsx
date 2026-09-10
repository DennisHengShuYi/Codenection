import { useState } from 'react'
import type { BlockRecord } from '../../domain/blockLog'
import type { Fix, Schedule } from '../../optimizer'
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

// §1.5: colour never carries meaning alone. These shades are paired with the band word in
// the button's accessible name *and* with `BAND_GLYPH` below, visibly, in the button itself
// -- an accessible name is not a visual pairing.
const BAND_SHADE: Record<LoadBand, string> = {
  light: 'bg-line/40',
  busy: 'bg-attention/30',
  heavy: 'bg-attention/70',
}

/** The spec's own mockup legend: `░ light ▓ busy █ heavy`. The only visible (not just
 *  spoken) distinction between the three load bands. */
const BAND_GLYPH: Record<LoadBand, string> = {
  light: '░',
  busy: '▓',
  heavy: '█',
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
  readonly today: number
  readonly working: boolean
  readonly report: string | null
  /**
   * §2.2/§4: the single best remaining move, when Rebalance could not improve the
   * fortnight but the fortnight still needs help. Null when the solver found something to
   * do, or when the week needs nothing at all -- `describeRebalance` already tells those
   * two apart in `report`, so the fallback only ever adds to that, never contradicts it.
   * Optional and defaulting to null so every caller built before this feature existed
   * keeps compiling and behaving exactly as it did.
   */
  readonly fallback?: Fix | null
  readonly onRebalance: () => void
  readonly onSelectBlock: (itemId: string) => void
  /**
   * §8b's durable record of what was scheduled and what became of it. Threaded through to
   * `scheduleView` exactly as `roomModel` threads it (`src/ui/room/roomModel.ts`), so a block
   * answered through the log is not mislabelled "not confirmed" on the app's primary surface
   * just because this screen forgot to pass it on. Optional and defaulting to empty so every
   * caller built before the log existed keeps compiling and behaving exactly as it did.
   */
  readonly blockLog?: readonly BlockRecord[]
}) {
  const {
    schedule,
    today,
    working,
    report,
    fallback = null,
    onRebalance,
    onSelectBlock,
    blockLog = [],
  } = props
  const [openDay, setOpenDay] = useState<number | null>(null)

  const cells = scheduleView({ schedule, today, blockLog })

  /**
   * Fixed load is the baseline everything else is measured against, so a week with none is
   * a week the app is quietly guessing about -- and the grid draws that as twenty-one
   * light days, which reads as good news rather than as missing information.
   *
   * `protectedRest` is excluded deliberately: rest the optimizer pinned is fixed load the
   * student did not put there, and counting it would let the app fall silent about a
   * timetable it still has never seen.
   */
  const hasFixedLoad = schedule.items.some((item) => item.fixed && !item.protectedRest)

  const grid = openDay === null ? null : dayGrid(schedule, openDay)

  return (
    <div className="flex flex-col gap-4">
      {!hasFixedLoad && (
        <p data-testid="no-fixed-load" className="text-sm text-ink-soft">
          Your week has no classes or shifts in it. Add them and the forecast gets a lot
          sharper.
        </p>
      )}

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
                // A disclosure, not a toggle button: tapping reveals the day grid beneath
                // it rather than setting a persisted on/off state, so `aria-expanded` is
                // the correct role for a screen reader -- `aria-pressed` would misreport it.
                aria-expanded={openDay === cell.dayIndex}
                onClick={() => setOpenDay(cell.dayIndex)}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border border-line p-2 text-xs aspect-square md:aspect-auto ${BAND_SHADE[cell.band]}`}
              >
                <span>{dayLabel(cell.dayIndex, cell.date)}</span>
                <span aria-hidden="true">{BAND_GLYPH[cell.band]}</span>
                {cell.deficit && <span aria-hidden="true">⚠</span>}
                {/* §4: the confirmation prompt discoverable from the overview, not only from
                    the card -- quiet on purpose, so the deficit ⚠ above stays the louder
                    signal. Paired with the same "not confirmed" text already in the button's
                    accessible name. */}
                {cell.unconfirmed && <span aria-hidden="true">?</span>}
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

        {fallback !== null && (
          <p data-testid="rebalance-fallback" role="status" className="text-sm text-ink-soft">
            Nothing I tried improved the week overall, but this would still cut into the
            deficit: {fallback.move.description}.
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
              className={`absolute left-14 right-2 min-h-11 break-words rounded-lg p-1 text-left text-xs text-on-color ${TYPE_HUE[item.type]}`}
              style={{ top: `${topPercent}%`, height: `${heightPercent}%` }}
            >
              {/* `break-words` on both lines: a pasted URL or a spaceless course code must
                  wrap inside the day grid's narrow column rather than push past it -- the
                  single-column layout only survives 320px if nothing inside it can force a
                  wider box (§4). */}
              <div className="break-words">{item.title}</div>
              <div className="break-words">
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
