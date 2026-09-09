import { outingsFor, type Outing } from '../../domain/outings'

const cost = (ringgit: number): string => (ringgit === 0 ? 'free' : `about RM${ringgit}`)

const duration = (hours: number): string => (hours < 1 ? `${hours * 60} min` : `${hours} h`)

/**
 * §5.3: three taps from feeling bad to having a plan.
 *
 * The door is already lit by the time this opens -- that decision lives in `roomState.ts`.
 * This is the part that was missing: somewhere to actually go, filtered by the gap the
 * student has and by what they can spend, and chosen in one tap.
 *
 * Every option is a real button rather than a clickable row, because this is the flow
 * somebody uses at their worst and a mouse-only path is one more obstacle at the wrong
 * moment.
 */
export function DoorPanel({
  gapHours,
  budgetRinggit,
  onChoose,
  onClose,
}: {
  gapHours: number
  budgetRinggit?: number
  onChoose: (outing: Outing) => void
  onClose: () => void
}) {
  const options = outingsFor(gapHours, budgetRinggit)

  return (
    <div
      data-testid="door-panel"
      role="dialog"
      aria-label="Getting out of the house"
      className="flex flex-col gap-3 rounded-lg bg-amber-50 p-4 text-sm"
    >
      <p className="font-medium">Getting outside is the best thing available right now.</p>

      {options.length === 0 ? (
        // A sentence rather than an empty box: nothing to offer is an answer, and an empty
        // list reads as a bug.
        <p className="opacity-80">
          There is not enough time in today for this. Try again when something moves.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {options.map((outing) => (
            <li key={outing.id}>
              <button
                type="button"
                data-testid={`outing-${outing.id}`}
                onClick={() => onChoose(outing)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-amber-300 bg-white p-3 text-left"
              >
                <span className="font-medium">{outing.title}</span>
                <span className="text-xs opacity-70">
                  {duration(outing.hours)} · {cost(outing.costRinggit)}
                </span>
                <span className="text-xs opacity-70">{outing.note}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" onClick={onClose} className="self-start underline">
        Not now
      </button>
    </div>
  )
}
