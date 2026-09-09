import type { ObjectId } from './objects'
import type { RoomModel, RoomRow } from './roomModel'
import { describeRoom } from './roomText'

/**
 * The things you *do*. Always full size, because these are why the app is open.
 *
 * Clutter is not listed: it expands to one row per errand, and those join this band so a task
 * you are avoiding is never demoted below a report.
 */
const DOING: readonly ObjectId[] = ['desk', 'phone', 'door', 'papers', 'character']

/**
 * The things you *look at*. Half height, because a number you are reading is not a thing you
 * are doing, and giving them equal weight makes the six that matter harder to find.
 */
const LOOKING: readonly ObjectId[] = ['light', 'ceiling', 'window', 'bed', 'plant', 'mirror']

const bandOf = (row: RoomRow): 'doing' | 'looking' =>
  LOOKING.includes(row.id) ? 'looking' : 'doing'

/**
 * Every feature as a button, laid over the room.
 *
 * The room stays the backdrop and still reacts -- the object a button belongs to pulses as it
 * opens -- but nothing has to be *found* by tapping furniture. That was the trade the design
 * made: keep the room meaningful, stop making it load-bearing for discovery.
 *
 * A column on the right from 768px up, a grid below the room on a phone. Beside the room
 * rather than over it -- an overlay covered the furniture and made the room unusable.
 */
export function RoomButtons({
  model,
  onSelect,
}: {
  model: RoomModel
  onSelect: (objectId: ObjectId) => void
}) {
  const doing = model.rows.filter((row) => bandOf(row) === 'doing')
  const looking = model.rows.filter((row) => bandOf(row) === 'looking')

  const button = (row: RoomRow, small: boolean) => (
    <button
      key={row.id}
      type="button"
      data-testid={`button-${row.id}`}
      data-attention={String(row.attention)}
      /* Named, not only badged. §1.5's rule: colour alone cannot carry meaning, and a dot
         says nothing to somebody who cannot see it. */
      aria-label={row.attention ? `${row.label} — needs you` : row.label}
      onClick={() => onSelect(row.id)}
      className={`flex flex-col justify-between gap-1 rounded-xl border bg-white/90 text-left backdrop-blur transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none ${
        small ? 'px-3 py-2' : 'px-3 py-3'
      } ${row.attention ? 'border-amber-400 ring-1 ring-amber-300' : 'border-stone-300'}`}
    >
      <span
        className={`flex items-start gap-1.5 font-medium text-stone-800 ${small ? 'text-xs' : 'text-sm'}`}
      >
        {row.attention && (
          <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500" />
        )}
        {row.label}
      </span>
      <span className="text-xs text-stone-500">{row.reading}</span>
    </button>
  )

  return (
    <div
      data-testid="room-buttons"
      className="flex min-w-0 flex-col gap-2 md:w-72 md:shrink-0"
    >
      {/*
        §1.5's text equivalent. It used to sit in the rail these buttons replaced, so it
        moves with the job rather than being left behind -- the room has to be stated in
        words on the screen a student is actually on, not one tap away.
      */}
      <p
        data-testid="room-text-equivalent"
        className="rounded-xl bg-white/90 px-3 py-2 text-xs leading-relaxed text-stone-600 backdrop-blur"
      >
        {describeRoom(model.state)}
      </p>

      <div className="grid grid-cols-2 gap-2">{doing.map((row) => button(row, false))}</div>

      <div className="grid grid-cols-3 gap-2 md:grid-cols-2">
        {looking.map((row) => button(row, true))}
      </div>
    </div>
  )
}
