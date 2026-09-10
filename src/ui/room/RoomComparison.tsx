import { Room } from './Room'
import type { RoomModel } from './roomModel'

/**
 * One room, or two side by side.
 *
 * §1.3 wants "now" beside "if you accept" in the decision flow, and §10 is firm that two
 * rooms never sit side by side on a phone — so they stack below 768px and pair above it.
 *
 * `RequestBoxScreen` drives the two-room case: §2.3's price for saying yes is shown as the
 * room now beside the room you would be living in. This said "nothing drives it yet" until
 * batch D; it was written before that screen existed.
 *
 * §3 made `Room` a picture rather than a control surface, so there is nothing left for a
 * tap on either room to report -- `onSelect` went with it.
 */
export function RoomComparison({ now, ifAccepted }: { now: RoomModel; ifAccepted?: RoomModel }) {
  if (!ifAccepted) return <Room model={now} />

  return (
    <div data-testid="room-comparison" className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Now</h3>
        <Room model={now} />
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-xs font-medium uppercase tracking-wide text-ink-soft">If you accept</h3>
        <Room model={ifAccepted} />
      </div>
    </div>
  )
}
