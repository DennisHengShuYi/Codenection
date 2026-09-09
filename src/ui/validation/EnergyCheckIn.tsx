/** §7.5's stance, applied here too: ask relative, not absolute. Nobody knows their energy as
 *  a number, and asking for one would collect a figure that means nothing. */
const BANDS = [
  { label: 'Running on empty', value: 10 },
  { label: 'Low', value: 30 },
  { label: 'Getting by', value: 50 },
  { label: 'Pretty good', value: 70 },
  { label: 'Full of it', value: 90 },
] as const

/**
 * The one question §8.1 needs answered, and without which its whole scoring apparatus is
 * inert.
 *
 * The app predicts a student's energy two days out; this is where that prediction gets
 * checked against what actually happened. Until this existed, predictions could be made and
 * never resolved, so the published accuracy would have read "not enough data" forever.
 *
 * Deliberately not §7.8's full check-in, which also wants sleep, a word, and whether the plan
 * held. That is a larger thing and is not in §11's must-build tier. This is the single
 * question the falsifiable claim depends on.
 *
 * One tap, and it can be ignored: §7.9's rule that a prompt nobody can escape is one they
 * learn to dread applies just as much here.
 */
export function EnergyCheckIn({
  onReport,
  onDismiss,
}: {
  onReport: (energy: number) => void
  onDismiss: () => void
}) {
  return (
    <section
      data-testid="energy-check-in"
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-4"
    >
      <div>
        <h2 className="text-base font-medium">How is your energy today?</h2>
        <p className="text-sm opacity-70">
          One tap. It is how the app checks whether its predictions are any good.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {BANDS.map((band) => (
          <button
            key={band.value}
            type="button"
            data-testid={`energy-${band.value}`}
            onClick={() => onReport(band.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {band.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={onDismiss} className="self-start text-sm underline">
        Not now
      </button>
    </section>
  )
}
