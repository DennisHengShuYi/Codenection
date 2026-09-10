/**
 * Where the student is, as one value.
 *
 * §3 replaces the room's own zoom-on-an-object model with routing between two screens, a
 * sheet, and settings. There is still no stack for most of it -- opening `add` or
 * `settings` always starts from the room and closing always returns to it -- with one
 * deliberate exception: a block is opened from the week, not from the room, so closing it
 * has to leave you where you opened it rather than skipping past the week back to the
 * room. That is the one place a stack is worth having.
 *
 * This value is also what the address bar shows. `toPath` and `fromPath` below are the
 * whole of that translation, and they are pure: the URL is a PROJECTION of this value,
 * never a second place the app stores where it is. `useUrlView` owns the impure half --
 * `history`, `popstate`, a live `window` -- and nothing else in the app reads either.
 */

/**
 * The ways something can arrive, once one has been chosen.
 *
 * `calendar` is §1.4's optional supplement, and its position in this list is the decision
 * the spec asked for: "OCR primary, calendar as an additive import for those who use it,
 * never as the only path." It goes last, beside the others, never in front of them.
 */
export type AddWay = 'photo' | 'type' | 'request' | 'calendar'

/** Must agree with the union above -- this is what `isWay` checks, and so what makes
 *  `/add/calendar` a real address rather than a 404 back to the room. */
const WAYS: readonly AddWay[] = ['photo', 'type', 'request', 'calendar']

export type View =
  | { readonly kind: 'room' }
  | { readonly kind: 'week' }
  | { readonly kind: 'block'; readonly itemId: string }
  /** `way` is null at the chooser. It used to be `AddSheet`'s own `useState`, which is
   *  exactly why `/add/photo` could not be an address: a sub-flow nothing outside the
   *  component knew about cannot be written down. */
  | { readonly kind: 'add'; readonly way: AddWay | null }
  | { readonly kind: 'settings' }
  /** Ruling 59: the gauge in the room's corner is the door to the full readout -- the
   *  dial, the trend line and the five bars -- which used to sit at the foot of the week
   *  screen. Two capacity readings on one screen was the fault Ruling 53 fixed; this keeps
   *  them one behind the other instead. */
  | { readonly kind: 'reserves' }

export const ROOM: View = { kind: 'room' }
// Not exported: `toWeek()` and `back()` are the module's whole surface for it.
const WEEK: View = { kind: 'week' }

export const toWeek = (): View => WEEK

export const toBlock = (itemId: string): View => ({ kind: 'block', itemId })

export const toAdd = (way: AddWay | null = null): View => ({ kind: 'add', way })

export const toSettings = (): View => ({ kind: 'settings' })

export const toReserves = (): View => ({ kind: 'reserves' })

/** Everywhere returns to the room -- except a block, which returns to the week it was
 *  opened from. */
export const back = (view: View): View => (view.kind === 'block' ? WEEK : ROOM)

/**
 * The address for a view.
 *
 * A block sits UNDER the week rather than at a top-level `/block/:id`, because that is
 * already true of the app: `RoomShell` renders the week screen behind the block sheet, and
 * `back()` returns a block to the week even when it was opened from the room's stuck card.
 * The path says what the app already does rather than inventing a shallower second truth.
 *
 * The id is percent-encoded. Ids are free-form -- the planner derives one from whatever
 * the student typed -- so an unencoded slash would write a path with an extra segment in
 * it and read back as a different block, or as none.
 */
export const toPath = (view: View): string => {
  switch (view.kind) {
    case 'room':
      return '/'
    case 'week':
      return '/week'
    case 'block':
      return `/week/block/${encodeURIComponent(view.itemId)}`
    case 'add':
      return view.way === null ? '/add' : `/add/${view.way}`
    case 'settings':
      return '/settings'
    case 'reserves':
      return '/reserves'
  }
}

/** Empty segments dropped, so a hand-edited `/week/` means the week rather than nothing. */
const segments = (path: string): readonly string[] => path.split('/').filter((part) => part !== '')

const isWay = (part: string): part is AddWay => (WAYS as readonly string[]).includes(part)

/**
 * The view an address names, or the room for anything unrecognised.
 *
 * Total rather than throwing: this reads a string a person can type. An address the app
 * does not know is a student looking at a blank screen, so it resolves to the room -- and
 * `useUrlView` then corrects the bar, so it cannot go on asserting a state the app is not
 * in.
 */
export const fromPath = (path: string): View => {
  const parts = segments(path)

  if (parts.length === 0) return ROOM

  const [first, second, third] = parts

  if (first === 'week') {
    if (parts.length === 1) return WEEK
    if (parts.length === 3 && second === 'block' && third !== undefined) {
      return toBlock(decodeURIComponent(third))
    }
    return ROOM
  }

  if (first === 'settings' && parts.length === 1) return toSettings()

  if (first === 'reserves' && parts.length === 1) return toReserves()

  if (first === 'add') {
    if (parts.length === 1) return toAdd()
    if (parts.length === 2 && second !== undefined && isWay(second)) return toAdd(second)
  }

  return ROOM
}

/**
 * Is moving from `from` to `to` a step back OUT of where you are?
 *
 * This is the whole of push-versus-replace. Descending pushes a history entry, so Back
 * steps down one level -- `/add/type` back to `/add`, then to the room. Ascending replaces
 * instead: a Cancel that pushed would leave Back walking the student FORWARD into the flow
 * they had just cancelled.
 *
 * Compared segment by segment rather than by string prefix, so `/add` could never count as
 * an ancestor of some future `/added-something`.
 */
export const isAscent = (from: View, to: View): boolean => {
  const here = segments(toPath(from))
  const there = segments(toPath(to))

  if (there.length >= here.length) return false

  return there.every((part, index) => part === here[index])
}
