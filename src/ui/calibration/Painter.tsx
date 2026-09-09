import { cycleCell, type Cell, type PainterGrid } from '../../domain/painter'

const DAY_LABELS = ['Yesterday', 'The day before', 'A weekend day'] as const

/** What each state looks like. Colour alone never carries the meaning -- every cell also
 *  has an accessible name saying what it is, per §1.5's stance on the room. */
const CELL_STYLE: Record<Cell, string> = {
  free: 'bg-slate-100',
  study: 'bg-indigo-400',
  work: 'bg-amber-400',
  errands: 'bg-lime-400',
  rest: 'bg-sky-300',
  social: 'bg-rose-300',
  sleep: 'bg-slate-500',
}

/**
 * §7.2's three-day painter: a prefilled hour grid, tap only what is wrong, roughly twenty
 * seconds.
 *
 * Yesterday, the day before, and one weekend day -- §7.2's own choice, because recall
 * collapses past 48 hours and three days gives enough contrast between a loaded day and a
 * light one.
 *
 * Every cell is a real button with a name saying its day, hour and state. This is the
 * densest control in the app, and a grid of unlabelled coloured divs is unusable to anybody
 * not looking at it.
 */
export function Painter({
  grid,
  onChange,
}: {
  grid: PainterGrid
  onChange: (next: PainterGrid) => void
}) {
  return (
    <div data-testid="painter" className="flex flex-col gap-2 overflow-x-auto">
      <p className="text-sm opacity-70">
        Tap only what is wrong. Each tap moves through free, study, work, errands, rest,
        people, sleep.
      </p>

      {grid.map((day, dayIndex) => (
        <div key={dayIndex} className="flex flex-col gap-1">
          <span className="text-xs font-medium">{DAY_LABELS[dayIndex] ?? `Day ${dayIndex}`}</span>
          <div className="flex gap-0.5">
            {day.map((cell, hour) => (
              <button
                key={hour}
                type="button"
                data-testid={`cell-${dayIndex}-${hour}`}
                aria-label={`${DAY_LABELS[dayIndex] ?? `Day ${dayIndex}`}, ${hour}:00, ${cell}`}
                onClick={() => onChange(cycleCell(grid, dayIndex, hour))}
                className={`h-6 w-3 shrink-0 rounded-sm ${CELL_STYLE[cell]}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
