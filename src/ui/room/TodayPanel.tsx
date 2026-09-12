import { useState } from 'react'
import { createPortal } from 'react-dom'
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
        {/* Dropped a little below the button's top edge rather than level with it. The
            help button is a 24px circle and this is 12px text, so aligning the two at the
            top sets the first line against the circle's shoulder and reads as a collision.
            Starting the sentence just under it lets the question mark sit clear in the
            corner, where it looks like an affordance rather than the paragraph's first
            character. */}
        <p data-testid="panel-intro" className="flex-1 pt-1.5 text-xs text-ink-soft">
          The room fills with what today asks of you — each object grows with the hours behind
          it, and empties as you get through them. The clock on the wall shows how much of the
          day is spoken for altogether.
        </p>

        {/* A question mark is not a word, so the name carries the question it answers. */}
        <button
          type="button"
          data-testid="panel-help"
          /* Named so it cannot be confused with a form field. "What else changes in the
             room" reads better and collides: Playwright's `getByLabel('What')` matches an
             accessible name by substring, so this button answered to the add form's own
             "What" box and four browser tests failed on a strict-mode violation, at four
             widths, a long way from the button that caused it. */
          aria-label="Other things that change in the room"
          aria-expanded={helpOpen}
          onClick={() => setHelpOpen(!helpOpen)}
          /* 44px of hit area around a 24px ring. §0.2's touch minimum is about the
             finger, not the drawing -- shrinking the ring to match the target would make
             the question mark shout, and growing the ring to 44 would make it a button
             competing with the rows underneath. Negative margin so the larger target does
             not push the paragraph beside it around. */
          className="-m-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ground focus-visible:outline focus-visible:outline-2"
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-full border border-line text-xs"
          >
            ?
          </span>
        </button>
      </div>

      {/* A dialog rather than a section unfolded in place. The rows expand in place because
          each one belongs to the row above it; this belongs to the room rather than to the
          list, and unfolding six paragraphs mid-panel pushes the day's own items off the
          screen to answer a question about something else. */}
      {/* Portalled to the body, which is what makes "over the whole screen" true rather than
          nearly true. On a laptop this panel is the floating aside, and that aside carries
          `backdrop-blur` -- a backdrop-filter establishes a containing block for `fixed`
          descendants, so the sheet's `inset-0` resolved against a 16rem column and the
          dialog opened inside the sidebar it was launched from, clipped by its own scroll
          box. Nothing in the sheet was wrong; it was being measured against the wrong box. */}
      {helpOpen &&
        createPortal(
          <Sheet title="Other things that change in the room" onClose={() => setHelpOpen(false)}>
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
          </Sheet>,
          document.body,
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
              {/* The left column is the one that gives.
                  It used to be the other way round: the reading was `shrink-0`, so "nothing
                  recorded before this week" held its full width, squeezed the label to about
                  forty pixels -- one word per line -- and still ran past the edge of the
                  floating panel on a tablet. `min-w-0` is what lets a flex child shrink
                  below its own content at all, whatever the parent says. */}
              <span className="flex min-w-0 flex-col">
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
              {/* Its own content width, up to a cap.
                  Free to shrink, it took whatever the label left it -- about fifty pixels --
                  and broke "4 hours" into "4 / hours" and "easing off" into "easing / off".
                  Every row was legible and none of them read as a sentence. The cap is what
                  keeps the Bed's long reading from going back to squeezing the label. */}
              <span className="flex max-w-[45%] shrink-0 flex-col items-end text-right">
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
