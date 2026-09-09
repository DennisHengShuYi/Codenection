import { useState } from 'react'
import { type CalibrationProfile } from '../../domain/calibration'
import { emptyGrid, extractParameters, type PainterGrid } from '../../domain/painter'
import { HowYouWork } from './HowYouWork'
import { ModePicker } from './ModePicker'
import { Painter } from './Painter'

/**
 * §7's calibration, on one screen.
 *
 * Mode picker, three-day painter, and the "how you work" payoff together, because §7.6 is
 * what makes the other two feel like a benefit rather than a chore -- separating them would
 * leave the work visible and the reward somewhere else.
 *
 * Nothing here gates anything (§7.7). It can be left at any point and the app carries on
 * with whatever it already knew.
 */
export function CalibrationScreen({
  profile,
  onChange,
  onDone,
}: {
  profile: CalibrationProfile
  onChange: (next: CalibrationProfile) => void
  onDone: () => void
}) {
  const [grid, setGrid] = useState<PainterGrid>(emptyGrid())

  function onPaint(next: PainterGrid) {
    setGrid(next)

    const extracted = extractParameters(next)

    onChange({
      ...profile,
      painted: true,
      // Only overwrite what was actually measured. §7.2: fiction calibrated into the model
      // is worse than no data, so an unmeasured parameter keeps the population default
      // rather than being replaced by a null.
      sleepBaselineHours: extracted.sleepBaselineHours ?? profile.sleepBaselineHours,
      peakStartHour: extracted.peakStartHour ?? profile.peakStartHour,
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-md flex-col gap-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Tune it to you</h1>
        <p className="text-sm opacity-70">
          Correct what is wrong. Nothing here is required — the app already works.
        </p>
      </header>

      <ModePicker profile={profile} onChange={onChange} />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">The last three days</h2>
        <Painter grid={grid} onChange={onPaint} />
      </section>

      <HowYouWork profile={profile} />

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white sm:w-auto"
      >
        Done
      </button>
    </main>
  )
}
