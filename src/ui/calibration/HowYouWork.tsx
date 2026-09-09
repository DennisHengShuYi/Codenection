import { LOAD_TYPES } from '../../engine'
import { calibrationProgress, focusMinutes, type CalibrationProfile } from '../../domain/calibration'
import { biasLine } from '../../domain/realityCheck'

/**
 * §7.6: the payoff that makes calibration feel like a benefit rather than a chore.
 *
 * Every line here is only shown when it is actually true of this student. A screen claiming
 * "you focus well for about 90 minutes" from no measurement is worse than a screen with
 * fewer lines on it -- §11 calls this the sharpest answer to "how is this different from a
 * to-do list", and it is only sharp if none of it is invented.
 *
 * That means a new student sees very little here, which is the honest state. §7.7's meter is
 * what makes that read as progress rather than emptiness.
 */
function linesFor(profile: CalibrationProfile): string[] {
  const lines: string[] = []

  if (profile.modeChosen || profile.painted) {
    lines.push(
      `You focus for about ${focusMinutes(profile.focus)} minutes before you drift, so blocks are sized to that.`,
    )
  }

  if (profile.peakStartHour !== null) {
    lines.push(`Your best hours start around ${profile.peakStartHour}:00.`)
  }

  if (profile.painted) {
    lines.push(`You sleep about ${Math.round(profile.sleepBaselineHours * 10) / 10} hours a night.`)
  }

  // §2.4's second surface. Silent until there is enough history to mean it.
  for (const type of LOAD_TYPES) {
    const line = biasLine(profile.confirmations, type)
    if (line !== null) lines.push(line)
  }

  return lines
}

export function HowYouWork({ profile }: { profile: CalibrationProfile }) {
  const lines = linesFor(profile)
  const progress = Math.round(calibrationProgress(profile) * 100)

  return (
    <section data-testid="how-you-work" className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-medium">How you work</h2>
        {/* §7.7: the meter reads as progress, never as a gate. */}
        <p className="text-sm opacity-70">
          {progress}% tuned. It gets sharper every time you tell it how a block went.
        </p>
      </div>

      {lines.length === 0 ? (
        <p className="text-sm opacity-80">
          Nothing measured yet. Paint three days or confirm a block and this fills in.
        </p>
      ) : (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
