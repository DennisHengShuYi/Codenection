import { Room } from './Room'
import type { ObjectId } from './objects'
import type { RoomModel } from './roomModel'

/**
 * One room, or two side by side.
 *
 * §1.3 wants "now" beside "if you accept" in the decision flow, and §10 is firm that two
 * rooms never sit side by side on a phone — so they stack below 768px and pair above it.
 *
 * Nothing drives the two-room case yet: the request box that would is §2.3, in the next
 * plan. The layout is built now so the room does not need reshaping when that arrives,
 * rather than building a fake trigger for a feature with no real caller.
 */
export function RoomComparison({
  now,
  ifAccepted,
  onSelect,
}: {
  now: RoomModel
  ifAccepted?: RoomModel
  onSelect?: (objectId: ObjectId) => void
}) {
  if (!ifAccepted) return <Room model={now} onSelect={onSelect} />

  return (
    <div data-testid="room-comparison" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase tracking-wide opacity-70">Now</h3>
        <Room model={now} onSelect={onSelect} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase tracking-wide opacity-70">If you accept</h3>
        <Room model={ifAccepted} />
      </div>
    </div>
  )
}
