import type { Prescription } from '../../domain/prescribe'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'

const hoursLabel = (hours: number): string =>
  hours === 1 ? '1 hour' : hours % 1 === 0 ? `${hours} hours` : `${hours} h`

/**
 * §5.2's one option, redrawn without the contradiction §7 flags.
 *
 * The prescription itself already said one thing, never a menu, because a depleted person
 * cannot choose. But the old surface handed the student a physical door on the way out
 * of that card -- three outings to pick from -- which is a menu wearing a different hat.
 * This replaces both `Prescription` and the door's `DoorPanel`: one title, one sentence,
 * two buttons, nothing behind either of them.
 *
 * "Not today" used to be a report that fed a permanent suppression log: one afternoon
 * where a walk did not help meant the app never suggested walking again. It is a plain
 * dismissal now -- the caller is expected to hold it for the rest of the day and nothing
 * longer, which is why this component takes no payload back from it.
 */
export function RecoveryCard({
  prescription,
  onAccept,
  onDismiss,
}: {
  prescription: Prescription | null
  onAccept: (prescription: Prescription) => void
  onDismiss: () => void
}) {
  if (prescription === null) return null

  return (
    <Card
      tone="calm"
      data-testid="recovery-card"
      role="status"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-lg font-medium text-ink">{prescription.title}</h2>
        <p className="text-sm text-ink-soft">
          About {hoursLabel(prescription.hours)}. It is the thing that would help most right
          now.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onAccept(prescription)}>Put it in my week</Button>
        <Button variant="quiet" onClick={onDismiss}>
          Not today
        </Button>
      </div>
    </Card>
  )
}
