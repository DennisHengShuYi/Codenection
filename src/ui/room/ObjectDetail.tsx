import type { RoomState } from './roomState'

const percent = (value: number): string => `${Math.round(value * 100)}%`

/** What each object is measuring, in the student's words rather than the model's. */
function describeObject(objectId: string, state: RoomState): string | null {
  switch (objectId) {
    case 'ceiling':
      return `The ceiling is down ${percent(state.ceilingPressure)}. That is everything you are carrying at once.`
    case 'papers':
      return `The stack is at ${percent(state.paperHeight)}. That is thinking work waiting on you.`
    case 'plant':
      return `The plant is at ${percent(state.plantHealth)}, which follows your sleep and how much you have moved.`
    case 'bed':
      return `The bed shows about ${Math.round(state.sleepDebt * 10) / 10} hours of sleep owed.`
    case 'window':
      return `The window shows what is ahead over the next three weeks: ${state.weather}.`
    case 'light':
      return `The light is at ${percent(state.lightLevel)}, following your reserve.`
    case 'door':
      return state.doorLit
        ? 'The door is lit. Getting outside is the best thing available right now.'
        : 'The door is quiet. Something else matters more at the moment.'
    case 'character':
      return `That is you, ${state.character.replace(/([A-Z])/g, ' $1').toLowerCase()}.`
    default:
      return null
  }
}

export function ObjectDetail({
  objectId,
  state,
  onComplete,
  onDefer,
  onClose,
}: {
  objectId: string
  state: RoomState
  onComplete: (id: string) => void
  onDefer: (id: string) => void
  onClose: () => void
}) {
  const box = state.clutter.find((item) => item.id === objectId)
  const description = box
    ? `${box.title}, sitting on day ${box.dayIndex}.`
    : describeObject(objectId, state)

  if (description === null) return null

  return (
    <div
      role="dialog"
      aria-label="Object details"
      className="flex flex-col gap-3 rounded-lg bg-slate-100 p-4 text-sm"
    >
      <p>{description}</p>

      {box && (
        <>
          {/*
            §6.4 says deferred load compounds rather than vanishing, and rolling debt is
            not built yet. Saying so is the difference between a simplification and a lie
            -- without it, "Later" looks like the week just got easier.
          */}
          <p className="text-xs opacity-70">
            Pushing it later does not make it go away — it will cost you more when it lands.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onComplete(box.id)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-white"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => onDefer(box.id)}
              className="rounded-lg border border-slate-400 px-3 py-2"
            >
              Later
            </button>
          </div>
        </>
      )}

      <button type="button" onClick={onClose} className="self-start underline">
        Close
      </button>
    </div>
  )
}
