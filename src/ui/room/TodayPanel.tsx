import { useState } from 'react'
import { Sheet } from '../kit/Sheet'
import type { PanelRow } from './todayRows'

/** The same clock the rest of the app writes, so 9 reads as 09:00 everywhere. */
const clockOf = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

const hoursLabel = (hours: number): string =>
  hours === 1 ? '1 hour' : Number.isInteger(hours) ? `${hours} hours` : `${hours} h`

/**
 * Ruling 46: what each object in the room means, and what is behind it today.
 *
 * **This is the control surface, and the drawing is not.** §3 removed tap-to-open from the
 * room and the e2e guard protecting it names this exact change in its own docstring -- but
 * the structural reason matters more than the recorded one: the drawing carries
 * `role="img"`, which hides its entire subtree from the accessibility tree. A shape made
 * clickable inside it would be invisible to a screen reader while looking perfectly correct
 * on screen.
 *
 * So every row is a real `<button>` out here: keyboard-reachable, announced, and expanding
 * in place rather than opening a sheet on top of a sheet.
 *
 * Rendered in two containers at two widths -- floating beside the room from 768px, in a
 * sheet below that -- which is why this component knows nothing about either. Where it sits
 * is not a property of what today contains.
 */
/**
 * Ruling 46, second half: the things in the room that do not come from today's list.
 *
 * The rows account for the objects that fill with what is on today. These move for other
 * reasons entirely -- how the student actually is, what the fortnight forecasts, whether the
 * day fits inside its own hours -- and none of them was named anywhere. A student watching
 * the room darken on a day with three hours on it had no way to learn that the darkness is
 * about the hours not fitting rather than about them.
 *
 * Behind a question mark rather than on the panel: they do not change with the list, and five
 * more paragraphs above six rows would bury the thing the panel was opened for.
 */
const ELSEWHERE: readonly { readonly what: string; readonly driven: string }[] = [
  {
    what: 'The character',
    driven:
      'your lowest reserve, not the average — one empty reserve is the whole story however the others look',
  },
  {
    what: 'The corner gauge',
    driven: 'the average of the four, as a percentage',
  },
  {
    what: 'The door',
    driven:
      'lit when time outside and time with people are both nearly gone — the one move that answers both',
  },
  {
    what: 'The weather through the window',
    driven:
      'the forecast: a storm when the fortnight runs into deficit within a week, clouds when it is further off',
  },
  {
    what: 'The light in the room, and how dark the window goes',
    driven:
      'the hours today asks for that do not fit inside it — this is the day overrunning, not you',
  },
]

export function TodayPanel({ rows }: { rows: readonly PanelRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2">
      {/* Ruling 46: the rule the rows below are instances of, said once.
      
          Without it the panel is a list of nouns and numbers -- a student reads "Books, 4
          hours" and still has to work out that the books on the desk ARE those four hours.
          It is the same rule for every row, so repeating it six times would be noise; each
          row carries only what is particular to it. */}
      <div className="flex items-start gap-2 px-2 pt-1">
        <p data-testid="panel-intro" className="flex-1 text-xs text-ink-soft">
          The room fills with what today asks of you — each object grows with the hours behind
          it, and empties as you get through them. The clock on the wall shows how much of the
          day is spoken for altogether.
        </p>

        {/* A question mark is not a word, so the name carries the question it answers. */}
        <button
          type="button"
          data-testid="panel-help"
          aria-label="What else changes in the room"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen(!helpOpen)}
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line text-xs text-ink-soft hover:bg-ground focus-visible:outline focus-visible:outline-2"
        >
          ?
        </button>
      </div>

      {/* A dialog rather than a section unfolded in place. The rows expand in place because
          each one belongs to the row above it; this belongs to the room rather than to the
          list, and unfolding six paragraphs mid-panel pushes the day's own items off the
          screen to answer a question about something else. */}
      {helpOpen && (
        <Sheet title="What else changes in the room" onClose={() => setHelpOpen(false)}>
          <div data-testid="panel-help-body" className="flex flex-col gap-3 text-sm">
            <p className="text-ink-soft">
              These move for other reasons — not for what is on today.
            </p>

            <dl className="flex flex-col gap-3">
              {ELSEWHERE.map((entry) => (
                <div key={entry.what} className="flex flex-col">
                  <dt className="font-medium text-ink">{entry.what}</dt>
                  <dd className="text-ink-soft">{entry.driven}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Sheet>
      )}

      <ul data-testid="today-panel" className="flex flex-col gap-1">
      {rows.map((row) => {
        // The bed carries no blocks -- sleep is not a block -- so it has nothing to open.
        // A row that expands to an empty list reads as a bug rather than as an answer.
        const expandable = row.blocks.length > 0
        const open = expandable && openId === row.id

        return (
          <li key={row.id}>
            <button
              type="button"
              data-testid={`panel-row-${row.id}`}
              data-drawn={row.drawn}
              aria-expanded={expandable ? open : undefined}
              onClick={() => setOpenId(open ? null : row.id)}
              className="flex w-full min-h-11 items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ground focus-visible:outline focus-visible:outline-2"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium text-ink">{row.label}</span>
                <span className="text-xs text-ink-soft">{row.meaning}</span>
              </span>

              {/* The number, and under it where that number is heading.
                  Together on the right because the phrase qualifies the figure: beside the
                  meaning on the left it sat three lines from the number it was about, and read
                  as unrelated to it.

                  The phrase only where something measured it -- one on a row with no reading
                  behind it is a claim, the same rule `DomainBarList` applies to its glyph. And
                  words rather than an arrow, because up means "more load" here and "more
                  reserve" two taps away, which are opposite news. */}
              <span className="flex shrink-0 flex-col items-end">
                {/* Counted where counting is the honest measure -- a box is one errand, not
                    half an hour of one -- and timed everywhere else. */}
                <span className="text-sm tabular-nums text-ink-soft">
                  {/* The row's own words first, where it has them. Only the bed does, and
                      only on the fortnight's first morning: it has no night before it to
                      report, and "nothing today" would read as an all-nighter. */}
                  {row.reading ??
                    (row.id === 'boxes'
                      ? row.count === 1
                        ? '1 thing'
                        : `${row.count} things`
                      : row.hours === 0
                        ? 'nothing today'
                        : hoursLabel(row.hours))}
                </span>
                {row.trend !== null && (
                  <span
                    data-testid={`panel-trend-${row.id}`}
                    className="text-xs font-medium text-ink"
                  >
                    {row.trend}
                  </span>
                )}
              </span>
            </button>

            {open && (
              <ul data-testid={`panel-blocks-${row.id}`} className="flex flex-col gap-0.5 px-2 pb-2">
                {row.blocks.map((entry) => (
                  <li
                    key={entry.id}
                    data-testid={`panel-block-${entry.id}`}
                    data-done={entry.done}
                    className={`flex justify-between gap-3 text-xs ${
                      entry.done ? 'text-ink-soft line-through' : 'text-ink'
                    }`}
                  >
                    <span>
                      {clockOf(entry.startHour)} · {entry.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink-soft">{hoursLabel(entry.hours)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
      </ul>
    </div>
  )
}
