import type { MicroStart } from '../../domain/microStart'

/**
 * §4.1: one concrete first action, time-boxed, offered without being asked for.
 *
 * "You don't have to write the essay. You have to open the document and write the title.
 * Eight minutes."
 *
 * One action and one way out. A stuck person cannot choose from a menu — the same reason
 * §5.2 gives for prescriptions — so there is nothing here to deliberate over.
 */
export function MicroStartCard({
  microStart,
  onStarted,
  onDismiss,
}: {
  microStart: MicroStart | null
  onStarted: (microStart: MicroStart) => void
  onDismiss: () => void
}) {
  if (microStart === null) return null

  return (
    <section
      data-testid="micro-start"
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-violet-300 bg-violet-50 p-4"
    >
      <div>
        <h2 className="text-base font-medium">Stuck on this one?</h2>
        <p className="text-sm">{microStart.action}</p>
        <p className="text-sm opacity-70">{microStart.minutes} minutes. That is the whole ask.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStarted(microStart)}
          className="rounded-lg bg-slate-900 px-4 py-3 text-white"
        >
          I&apos;ll do that
        </button>
        <button type="button" onClick={onDismiss} className="px-4 py-3 text-sm underline">
          Not now
        </button>
      </div>
    </section>
  )
}
