import type { CalibrationProfile, FocusBucket, Mode } from '../../domain/calibration'

/** §7.1's table: the mode, and the failure mode it makes the app watch for. */
const MODES: ReadonlyArray<{ mode: Mode; label: string; watches: string }> = [
  { mode: 'studying', label: 'Studying', watches: 'deadline pile-ups' },
  { mode: 'working', label: 'Working', watches: 'chronic drain with no slack' },
  { mode: 'both', label: 'Studying and working', watches: 'collisions between the two' },
  { mode: 'between', label: 'Between things', watches: 'drift and isolation' },
]

/** §7.5: "how long before you drift", in buckets. Never "how many hours can you focus". */
const FOCUS: ReadonlyArray<{ bucket: FocusBucket; label: string }> = [
  { bucket: 'under30', label: 'Under 30 minutes' },
  { bucket: 'about1h', label: 'About an hour' },
  { bucket: 'couple', label: 'A couple of hours' },
  { bucket: 'longer', label: 'Longer than that' },
]

/**
 * §7.1: one screen, four taps, sets every prior.
 *
 * Opens with an answer already selected rather than as an empty form -- §7's governing
 * constraint is that editing something wrong is roughly five times faster than building from
 * nothing, and psychologically a different task.
 */
export function ModePicker({
  profile,
  onChange,
}: {
  profile: CalibrationProfile
  onChange: (next: CalibrationProfile) => void
}) {
  // The container is "calibration-modes" rather than "mode-picker" on purpose: the radios
  // are `mode-*`, and a container sharing that prefix gets swept into every
  // getAllByTestId(/^mode-/) count. Third time this project has hit that, after
  // `chip-`/`chip-unsure-` and the duplicate dial ids.
  return (
    <section data-testid="calibration-modes" className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What are you doing at the moment?</legend>

        {MODES.map(({ mode, label, watches }) => (
          <label key={mode} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              data-testid={`mode-${mode}`}
              checked={profile.mode === mode}
              onChange={() => onChange({ ...profile, mode, modeChosen: true })}
              className="mt-1"
            />
            <span>
              {label}
              <span className="block text-xs opacity-70">Watches for {watches}.</span>
            </span>
          </label>
        ))}
      </fieldset>

      {/* §7.1: a toggle on top of mode, not a fifth option. In low-structure states the
          optimizer defends a floor rather than flattening peaks. */}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={profile.semesterBreak}
          onChange={(event) => onChange({ ...profile, semesterBreak: event.target.checked })}
        />
        It is semester break
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">How long before you drift?</legend>

        {FOCUS.map(({ bucket, label }) => (
          <label key={bucket} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="focus"
              data-testid={`focus-${bucket}`}
              checked={profile.focus === bucket}
              onChange={() => onChange({ ...profile, focus: bucket })}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </section>
  )
}
