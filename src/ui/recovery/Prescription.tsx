import type { Prescription as PrescriptionData } from '../../domain/prescribe'

const hoursLabel = (hours: number): string =>
  hours === 1 ? '1 hour' : hours % 1 === 0 ? `${hours} hours` : `${hours} h`

/**
 * §5.2's one option, and the shape is the point.
 *
 * A depleted person cannot choose from a menu, and every extra option lowers the odds of any
 * action at all -- so there is one thing to do and one way out, and the way out is not a
 * second thing dressed up as a choice.
 *
 * Dismissing is not silent: it reports that this did not help, which is what feeds the
 * failed-recovery log. Without that the app would go on suggesting the same useless thing
 * forever, which is exactly what §5.2's last line exists to prevent.
 */
export function Prescription({
  prescription,
  onAccept,
  onDismiss,
}: {
  prescription: PrescriptionData | null
  onAccept: (prescription: PrescriptionData) => void
  onDismiss: (prescription: PrescriptionData) => void
}) {
  if (prescription === null) return null

  return (
    <section
      data-testid="prescription"
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-sky-300 bg-sky-50 p-4"
    >
      <div>
        <h2 className="text-lg font-medium">{prescription.title}</h2>
        <p className="text-sm opacity-80">
          About {hoursLabel(prescription.hours)}. It is the thing that would help most right
          now.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAccept(prescription)}
          className="rounded-lg bg-slate-900 px-4 py-3 text-white"
        >
          Put it in my week
        </button>
        <button
          type="button"
          onClick={() => onDismiss(prescription)}
          className="px-4 py-3 text-sm underline"
        >
          This does not help me
        </button>
      </div>
    </section>
  )
}
