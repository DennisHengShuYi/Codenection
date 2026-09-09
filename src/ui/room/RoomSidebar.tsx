import type { ObjectId } from './objects'
import type { RoomModel } from './roomModel'
import { describeRoom } from './roomText'

/**
 * The sidebar, which is also §1.5's words view.
 *
 * One component with two presentations rather than two implementations that drift: a
 * persistent rail from 768px up, and a full-screen list below that, because a sidebar and a
 * usable room cannot share 320px.
 *
 * Selecting a row does the same thing as touching the object -- it focuses and zooms it. The
 * list teaches the mapping rather than replacing it, which is what keeps the room the thing
 * you operate rather than a picture beside a menu.
 *
 * Order is fixed and never sorted by urgency. Attention is marked, not moved: a list that
 * reorders itself has to be re-learned on every visit by somebody using a screen reader, and
 * a sighted student stops trusting muscle memory in it.
 */
export function RoomSidebar({
  model,
  onSelect,
  trimmed = false,
}: {
  model: RoomModel
  onSelect: (objectId: ObjectId) => void
  /** §1.5's low-energy mode: the same list, cut to what matters. */
  trimmed?: boolean
}) {
  const rows = trimmed
    ? model.rows.filter((row) => row.attention).slice(0, 2)
    : model.rows

  return (
    <nav data-testid="room-sidebar" aria-label="Everything in the room" className="flex flex-col gap-2">
      {/* §1.5's text equivalent, which used to sit under the drawing. Here it introduces a
          list you can actually operate rather than describing a picture you cannot.

          Named for the view it is in, not for the room: the buttons carry the same sentence
          on the room screen, and the words view is a full-screen overlay laid over them --
          one shared test id would match two paragraphs at once. */}
      <p data-testid="words-text-equivalent" className="text-sm opacity-80">
        {describeRoom(model.state)}
      </p>

      {trimmed && rows.length === 0 && (
        <p className="text-sm opacity-80">Nothing needs you right now.</p>
      )}

      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              data-testid={`row-${row.id}`}
              data-attention={String(row.attention)}
              onClick={() => onSelect(row.id)}
              className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"
            >
              <span className="font-medium">{row.label}</span>
              <span className="text-xs opacity-70">
                {row.reading}
                {/* Named, not only coloured -- §1.5's rule applied to the list as well as
                    the furniture. */}
                {row.attention ? ' — needs you' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
