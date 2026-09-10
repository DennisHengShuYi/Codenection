import type { MicroStart } from '../../domain/microStart'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'

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
    <Card
      data-testid="micro-start"
      role="status"
      tone="attention"
      className="flex flex-col gap-3"
    >
      <div>
        <h2 className="text-base font-medium">Stuck on this one?</h2>
        <p className="text-sm">{microStart.action}</p>
        <p className="text-sm text-ink-soft">{microStart.minutes} minutes. That is the whole ask.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onStarted(microStart)}>I&apos;ll do that</Button>
        <Button variant="quiet" onClick={onDismiss}>
          Not now
        </Button>
      </div>
    </Card>
  )
}
