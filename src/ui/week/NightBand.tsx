import type { JSX } from 'react'
import { nightWindowLabel, type NightWindow } from '../../domain/nightWindow'

/**
 * The night at the foot of the day, which is where a night belongs.
 *
 * Deliberately NOT a row on the hour grid. A night is the boundary BETWEEN two days rather
 * than something inside one, and `sleepByDay[d]` already means the night at the end of day d
 * -- so it is drawn once, under the day it ends, outside that day's hour axis. That is the
 * whole answer to a night crossing midnight: 23:00 to 07:00 needs no second column, and the
 * grid needs no eight empty rows added to every day to contain one band.
 *
 * A drawing and nothing more. Sleep is not a block (`engine/types.ts` records that a sleep
 * block "would be charged nothing by `drain.ts` while `sleepByDay` counted the same hours
 * again"), so nothing here is clickable, movable, or read by the model. It is the picture
 * behind `domain/sleepForecast`'s sentence.
 */
const hoursLabel = (hours: number): string => (hours === 1 ? '1 hour' : `${hours} hours`)

export function NightBand({
  night,
  lostHours,
}: {
  readonly night: NightWindow
  /**
   * Hours this day is forecast to take out of the night (`domain/sleepForecast.squeezeOn`).
   *
   * Capped against the night itself here rather than trusted: without the cap the drawn
   * portion runs past the band and the sentence claims more hours than the night has.
   */
  readonly lostHours: number
}): JSX.Element {
  const lost = Math.min(Math.max(lostHours, 0), night.hours)
  // Off the FRONT, because the wake time is the anchored end of a night: a day that runs long
  // pushes bedtime later rather than letting somebody sleep in. See `domain/nightWindow`.
  const lostPercent = night.hours === 0 ? 0 : (lost / night.hours) * 100

  return (
    <div
      data-testid="night-band"
      /*
       * The foot of the day, joined to the grid above it -- square on top, rounded below, one
       * border between them. The negative top margin cancels the `gap-3` its parent puts
       * between children: without it the grid's open bottom edge sits above a gap, which
       * reads as a broken box rather than as one day.
       *
       * Deliberately NOT dressed as one of the day's blocks. Those are coloured `<button>`s a
       * student presses to open a block, and this opens nothing: sleep is not a block
       * (`engine/types.ts` records the double count that would cause) and there is nothing to
       * edit. `RestPreview` states the rule this follows -- "a primary button that cannot do
       * anything is worse than no button: it invites a press and then does nothing, which
       * reads as the app being broken rather than as an honest no". So it shares the day's
       * box and none of its affordances: no hue, no hover, no cursor, not focusable.
       */
      className="-mt-3 mx-auto flex w-full max-w-2xl flex-col gap-1 rounded-b-xl border border-line bg-ground p-2"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">Night</span>
        <span className="text-xs tabular-nums text-ink-soft">
          {night.hours === 0
            ? nightWindowLabel(night)
            : `${nightWindowLabel(night)} — ${hoursLabel(night.hours)}`}
        </span>
      </div>

      {/* Only when something is being taken. An empty track under an untouched night is
          decoration that says nothing -- the bar exists to show the bite, so with no bite
          there is nothing for it to show.

          Hidden from assistive tech: the sentence below says the same thing in words, and a
          shape described as a shape is noise. */}
      {lost > 0 && (
        <div
          aria-hidden="true"
          data-testid="night-bar"
          className="flex h-2 overflow-hidden rounded bg-line"
        >
          <div className="h-full bg-attention" style={{ width: `${lostPercent}%` }} />
        </div>
      )}

      {lost > 0 && (
        <p data-testid="night-lost" className="text-xs font-medium text-ink">
          About {hoursLabel(lost)} of this is likely to go to the day.
        </p>
      )}
    </div>
  )
}
