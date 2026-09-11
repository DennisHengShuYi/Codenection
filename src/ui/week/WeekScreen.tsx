import { useState } from 'react'
import { checkedInDays, outcomesFrom, type BlockRecord } from '../../domain/blockLog'
import { describeDeficit, explainDeficit } from '../../domain/deficitCause'
import { paramsFor } from '../../domain/engineParams'
import { DEFICIT_THRESHOLD, LOAD_TYPES, project } from '../../engine'
import { toDayInputs } from '../../optimizer'
import type { Fix, Schedule } from '../../optimizer'
import { Button } from '../kit/Button'
import { dayGrid } from './dayGrid'
import { dayLabel } from '../../domain/calendar'
import { LOAD_TYPE_LABELS } from '../kit/labels'
import type { EnergyPrediction } from '../../domain/predictions'
import { scheduleView, type LoadBand } from '../../domain/scheduleView'
import { PushToCalendar } from './PushToCalendar'
import { ReserveTrack } from './ReserveTrack'

/**
 * §4's primary surface: the whole horizon, one day expanded beneath it, and Rebalance.
 *
 * Rebalance sits between the overview and the day grid rather than below both, because it
 * acts on the fortnight rather than on whichever day happens to be open -- if it moved down
 * with the day, a student opening a day to check on it would read Rebalance as scoped to
 * that day instead of the whole week (§4).
 *
 * §1.2's five-domain breakdown lives here, at the foot of the screen, rather than on the
 * room (Ruling 53). The room reads capacity once, as the corner gauge §1.1 asked for; a
 * student who wants to know *where* the reserve is going comes to the week, which is the
 * screen about how the fortnight spends it. Last rather than first because the horizon and
 * Rebalance are what §4 calls this screen's primary surface, and a dashboard above them
 * would push the fortnight's one action below the fold at 320px.
 *
 * It keeps the low-energy gate it had on the room, on the `lowEnergy` prop below -- moving
 * content between screens must not quietly move it out from under §1.5 (Ruling 56).
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

/**
 * The student's four words, not the model's.
 *
 * This was an identity map: it printed "mental", "physical", "social", "errands" -- the
 * engine's own type names -- onto a block in the week grid, while the Reserves sheet two
 * taps away called the same four things "Study & thinking", "Body & movement", "People" and
 * "Life admin". One reserve, two vocabularies, one screen apart.
 */
const TYPE_LABEL: Record<string, string> = LOAD_TYPE_LABELS

const TYPE_HUE: Record<string, string> = {
  mental: 'bg-load-mental',
  physical: 'bg-load-physical',
  social: 'bg-load-social',
  errands: 'bg-load-errands',
}

/**
 * Removed in favour of `domain/calendar.dayLabel`.
 *
 * This was a sixth place a raw index reached the student, and the worst-numbered of them:
 * `Day ${dayIndex}`, zero-based, as each grid cell's accessible name on an undated week --
 * so a screen reader announced the first day of the fortnight as "Day 0".
 */

export function WeekScreen(props: {
  readonly schedule: Schedule
  readonly today: number
  readonly working: boolean
  readonly report: string | null
  /**
   * What the last edit on this screen did, when it needs saying.
   *
   * Separate from `report`, which belongs to Rebalance. Later is the reason it exists:
   * `deferItem` returns the week unchanged when nothing between here and the deadline has
   * room, and the two outcomes were indistinguishable once the sheet closed. The room's own
   * `placement-note` could not carry it -- that lives behind the `Waiting` button, whose
   * count does not know about it, so the message would have waited behind a button reading
   * "Nothing waiting". This says it where the student already is.
   */
  readonly note?: string | null
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
   * The fourth way in, and the only direct one.
   *
   * The `+` sheet's three ways all read something -- a photo, a paragraph, a request -- and
   * then work out where it goes. This one starts from a day the student is already looking
   * at, so the day is what it hands back and the block lands exactly where they put it.
   */
  readonly onAddBlock: (dayIndex: number) => void
  /**
   * §8b's durable record of what was scheduled and what became of it. Threaded through to
   * `scheduleView` exactly as `roomModel` threads it (`src/ui/room/roomModel.ts`), so a block
   * answered through the log is not mislabelled "not confirmed" on the app's primary surface
   * just because this screen forgot to pass it on. Optional and defaulting to empty so every
   * caller built before the log existed keeps compiling and behaving exactly as it did.
   */
  readonly blockLog?: readonly BlockRecord[]
  /**
   * §8b's learned coefficients, threaded so the grid scores the fortnight the same way the
   * room does.
   *
   * Without it `scheduleView` fell back to `predictions = []`, the population priors -- so
   * for any calibrated student the week's deficit marks came from one model while the room's
   * gauge and the rebalancer came from another. The comment on `blockLog` above already
   * claimed this screen threaded through "exactly as `roomModel` threads it", and it did for
   * the log and not for these.
   */
  readonly predictions?: readonly EnergyPrediction[]
}) {
  const {
    schedule,
    today,
    working,
    report,
    note = null,
    fallback = null,
    onRebalance,
    onSelectBlock,
    onAddBlock,
    blockLog = [],
    predictions = [],
  } = props
  const [openDay, setOpenDay] = useState<number | null>(null)

  const cells = scheduleView({ schedule, today, blockLog, predictions })

  /**
   * Fixed load is the baseline everything else is measured against, so a week with none is
   * a week the app is quietly guessing about -- and the grid draws that as twenty-one
   * light days, which reads as good news rather than as missing information.
   *
   * `protectedRest` is excluded deliberately: rest the optimizer pinned is fixed load the
   * student did not put there, and counting it would let the app fall silent about a
   * timetable it still has never seen.
   */
  /**
   * Deliberately *not* `modeOf`, which asks a different question.
   *
   * This sentence claims the week has no classes or shifts in it, so the predicate has to be
   * "none at all" -- one timetabled lecture makes it false. `modeOf` asks whether there is
   * enough fixed load to call the fortnight a *frame*, and answers `lowStructure` for a
   * student with two classes, who does have classes. Sharing one predicate between the two
   * would make this line lie to exactly the student it is least useful to.
   */
  const hasFixedLoad = schedule.items.some((item) => item.fixed && !item.protectedRest)

  const grid = openDay === null ? null : dayGrid(schedule, openDay)

  /**
   * Why the open day is marked, or null when it is not.
   *
   * The grid's ⚠ says a day is in deficit and nothing else, and the days that most need
   * explaining are the ones that look empty: a light day carrying a warning is where a
   * fortnight of load finally lands, and nothing on that day accounts for it.
   *
   * Computed from the same projection that produced the mark, so the sentence cannot
   * describe a day the model did not simulate -- see `domain/deficitCause`.
   */
  const params = paramsFor(outcomesFrom(blockLog), predictions)
  const days = toDayInputs(schedule, checkedInDays(blockLog, today, schedule.horizonDays))
  const projection = project(schedule.start, days, params)
  const cause =
    openDay === null
      ? null
      : explainDeficit({ start: schedule.start, days, projection, params, dayIndex: openDay })

  /**
   * Where all four reserves stand on the day that is open.
   *
   * Computed for every day of the horizon and shown for none of them until now. The range
   * travels with the figure because the projection is three runs at different optimism
   * levels and `central` is the middle one -- §8.2 is explicit that this is a decision aid
   * and never described as validated, and one hard number per day quietly drops that.
   */
  const standing =
    openDay === null
      ? null
      : LOAD_TYPES.map((type) => ({
          type,
          middle: projection.central[openDay]?.[type] ?? 0,
          best: projection.optimistic[openDay]?.[type] ?? 0,
          worst: projection.pessimistic[openDay]?.[type] ?? 0,
        }))

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
          const parts = [dayLabel(schedule, cell.dayIndex, today), BAND_LABEL[cell.band]]
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
                // The visible half of `aria-expanded`. A screen reader has always known
                // which day was open; a sighted student had nothing, since the grid looks
                // identical whichever cell was tapped and the panel below only names a date
                // you have to read to check. §1.5's rule, arriving from the other side: an
                // accessible name is not a visual pairing.
                data-open={openDay === cell.dayIndex}
                onClick={() => setOpenDay(cell.dayIndex)}
                className={`flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs aspect-square md:aspect-auto ${BAND_SHADE[cell.band]} ${
                  openDay === cell.dayIndex
                    ? // Drawn with the border the cell already had rather than an outline or a
                      // ring: a ring sits outside the box and would overlap its neighbours in
                      // a grid this tight at 320px.
                      'border-ink shadow-sm'
                    : 'border-line'
                }`}
              >
                {/* Terser than the spoken name above deliberately: this is one of
                    twenty-one squares in a grid that has to hold at 320px, and "Today, Sat
                    12 Sep" wraps to three lines in it. The full phrase is in the cell's
                    accessible name, where there is room for it. The fallback is one-based
                    because "Day 1" is the first day to everyone but the array. */}
                <span>{cell.date ?? `Day ${cell.dayIndex + 1}`}</span>
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

        {note !== null && note !== undefined && (
          <p data-testid="week-note" role="status" className="text-sm text-ink-soft">
            {note}
          </p>
        )}

        {/* The outward write, under the actions rather than beside Rebalance: it is the one
            control on this screen that reaches outside the app, and it should not sit at
            the same weight as the one a student presses several times a week. */}
        <PushToCalendar schedule={schedule} today={today} />

        {fallback !== null && (
          <p data-testid="rebalance-fallback" role="status" className="text-sm text-ink-soft">
            Nothing I tried improved the week overall, but this would still cut into the
            deficit: {fallback.move.description}.
          </p>
        )}
      </div>

      {/* Ruling 64: the grid says what is on each day and the open day says how you stand on
          one of them. This is the third question and the one the projection was computed
          for -- where the fortnight is going. */}
      <ReserveTrack
        projection={projection}
        dayLabel={(dayIndex) => dayLabel(schedule, dayIndex, today)}
      />

      {grid !== null && openDay !== null && (
        <div className="flex flex-col gap-3">
          {/* Above the day rather than beside the mark: the mark is in a cell the size of a
              thumbnail, and this is two sentences. It also reads in the order a student
              asks the question -- they tapped the day because of the warning. */}
          {standing !== null && (
            <div data-testid="day-reserves" className="flex flex-col gap-1">
              {standing.map((reserve) => (
                <div
                  key={reserve.type}
                  data-testid={`reserve-${reserve.type}`}
                  data-deficit={reserve.middle < DEFICIT_THRESHOLD}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-ink">{LOAD_TYPE_LABELS[reserve.type]}</span>

                  <span className="flex items-baseline gap-2 tabular-nums">
                    <span
                      className={
                        reserve.middle < DEFICIT_THRESHOLD
                          ? 'font-semibold text-attention'
                          : 'text-ink'
                      }
                    >
                      {Math.round(reserve.middle)}
                    </span>
                    {/* The spread, small and beside it: the figure is the middle of three
                        runs, and showing it alone would read as a measurement. */}
                    <span className="text-xs text-ink-soft">
                      {Math.round(reserve.worst)}–{Math.round(reserve.best)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {cause !== null && (
            <p
              data-testid="deficit-why"
              role="status"
              className="rounded-lg border border-line bg-attention/10 p-3 text-sm text-ink"
            >
              {describeDeficit(cause)}
            </p>
          )}
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

          {/* Under the grid rather than above it: this adds to the day, so it has to
              follow the day it is about -- unlike Rebalance, which acts on the whole
              fortnight and therefore sits above the grid rather than with it. */}
          <Button
            variant="secondary"
            data-testid="add-block"
            onClick={() => onAddBlock(openDay)}
            className="mx-auto w-full max-w-2xl"
          >
            + Add a block to this day
          </Button>
        </div>
      )}
    </div>
  )
}
