import type { JSX } from 'react'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'

/**
 * The night the student is aiming for, and the nights ahead.
 *
 * Ruling 66: a page rather than a card, and that is the whole point of it. §8's check-in asks "how much
 * sleep last night?" once a day and then disappears -- it is CHECKING, about a night that
 * already happened, and the answer teaches the model. This is PLANNING: what the student
 * intends, reachable whenever they want it. The two write to different places for that
 * reason, and `domain/sleepReality` is what compares them.
 *
 * Presentational, with every commit owned by the parent -- `RestPreview`'s division, and the
 * established one here: a screen that takes data and callbacks cannot accidentally write a
 * week, and `RoomShell` composes the pure functions that do.
 */

/**
 * The targets on offer, in whole hours.
 *
 * Deliberately NOT `SLEEP_HOURS`' four reporting buckets, even though sharing them would keep
 * one vocabulary. Those exist because "nobody reports their night to the half hour" (§7.5),
 * and they include "under 5" -- which is an honest thing to report and an absurd thing to aim
 * for. Choosing a target is a deliberate act, so it gets deliberate figures; reporting keeps
 * its buckets, on the card that does the reporting.
 */
const TARGET_CHOICES: readonly number[] = [6, 7, 8, 9]

/** One night as the page shows it: already labelled, already carrying its own forecast, so
 *  this component derives nothing and cannot disagree with the room about a date. */
export interface PlannedNight {
  readonly dayIndex: number
  readonly label: string
  readonly hours: number
  /** Null when the day fits, which renders no element at all rather than an empty one. */
  readonly forecast: string | null
}

export function SleepSheet({
  targetHours,
  nights,
  realityLine,
  onSetTarget,
  onSetNight,
  onClose,
}: {
  readonly targetHours: number
  readonly nights: readonly PlannedNight[]
  /**
   * §7.6's line, or null.
   *
   * Null both when nothing has been measured and when low-energy mode is withholding it: a
   * measured statement about the student's own habits is exactly what that mode exists to
   * hold back, and this component does not need to know which reason applies.
   */
  readonly realityLine: string | null
  readonly onSetTarget: (hours: number) => void
  readonly onSetNight: (dayIndex: number, hours: number) => void
  readonly onClose: () => void
}): JSX.Element {
  return (
    <Sheet title="Sleep" onClose={onClose}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-medium">
          Aiming for <span data-testid="sleep-target">{targetHours}</span> hours a night
        </legend>
        <div className="flex flex-wrap gap-2">
          {TARGET_CHOICES.map((hours) => (
            <Button
              key={hours}
              size="sm"
              variant={hours === targetHours ? 'primary' : 'secondary'}
              data-testid={`sleep-target-${hours}`}
              onClick={() => onSetTarget(hours)}
            >
              {hours} h
            </Button>
          ))}
        </div>
      </fieldset>

      {/* Under the choices rather than above them, mirroring where `TodayCard` puts its own
          bias line and for that line's stated reason: above, it colours the choice being
          made rather than informing it. */}
      {realityLine !== null && (
        <p data-testid="sleep-reality" className="mt-3 text-sm text-ink-soft">
          {realityLine}
        </p>
      )}

      <hr className="my-3 border-line" />

      <ul className="flex flex-col gap-3">
        {nights.map((night) => (
          <li key={night.dayIndex} data-testid={`sleep-night-${night.dayIndex}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{night.label}</span>
              <span className="text-sm tabular-nums text-ink-soft">{night.hours} h</span>
            </div>

            {night.forecast !== null && (
              <p
                data-testid={`sleep-forecast-${night.dayIndex}`}
                className="mt-1 text-xs font-medium text-ink"
              >
                {night.forecast}
              </p>
            )}

            <div className="mt-1 flex flex-wrap gap-1">
              {TARGET_CHOICES.map((hours) => (
                <Button
                  key={hours}
                  size="sm"
                  variant={hours === night.hours ? 'primary' : 'secondary'}
                  data-testid={`sleep-night-${night.dayIndex}-${hours}`}
                  onClick={() => onSetNight(night.dayIndex, hours)}
                >
                  {hours}
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Sheet>
  )
}
