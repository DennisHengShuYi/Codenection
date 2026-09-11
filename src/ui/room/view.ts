import { HORIZON_DAYS } from '../../engine'

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
  /**
   * The reshuffle, held rather than applied.
   *
   * A door rather than a panel on the week: it is a decision with two answers, and a student
   * who taps Rebalance and then wanders off must not come back to a week that quietly
   * changed under them. Carries no state of its own -- the proposal itself lives in
   * `RoomShell`, because a solve is about a moment and cannot be reconstructed from an
   * address.
   */
  | { readonly kind: 'rebalance' }
  /** One block's own fields, under the block it is about. */
  | { readonly kind: 'editBlock'; readonly itemId: string }
  /**
   * §4.1's ladder, under the block it is about.
   *
   * A page rather than a panel on the sheet, and for the same reason `rebalance` is a door:
   * the point of it is that nothing else is in view. Somebody who cannot start a task is not
   * helped by the task sitting behind a card telling them how to start it.
   */
  | { readonly kind: 'microStart'; readonly itemId: string }
  /** A block being added to a named day, which is why the day is in the address: the form
   *  is opened FROM a day the student was already looking at. */
  | { readonly kind: 'newBlock'; readonly dayIndex: number }
  /** Ruling 61: everything the room used to stack in a band beneath the drawing -- the
   *  preview notice, the room in words, the accuracy line and the live cards -- behind one
   *  button, so the room is the drawing again. */
  | { readonly kind: 'notices' }
  /**
   * The Rest button's answer, held rather than applied.
   *
   * A door rather than a card, for `rebalance`'s reason: it is a decision with two answers,
   * and a student who presses Rest and then wanders off must not come back to a week that
   * quietly changed. Top level rather than under the week, because it is pressed from the
   * room -- often by somebody who has not opened their fortnight at all.
   *
   * Carries no state of its own. The plan lives in `RoomShell`: it is about a moment, and a
   * moment cannot be reconstructed from an address.
   */
  | { readonly kind: 'rest' }

export const ROOM: View = { kind: 'room' }
// Not exported: `toWeek()` and `back()` are the module's whole surface for it.
const WEEK: View = { kind: 'week' }
const REBALANCE: View = { kind: 'rebalance' }
const REST: View = { kind: 'rest' }

export const toWeek = (): View => WEEK

export const toBlock = (itemId: string): View => ({ kind: 'block', itemId })

export const toAdd = (way: AddWay | null = null): View => ({ kind: 'add', way })

export const toSettings = (): View => ({ kind: 'settings' })

export const toReserves = (): View => ({ kind: 'reserves' })

export const toRebalance = (): View => REBALANCE

export const toRest = (): View => REST

export const toEditBlock = (itemId: string): View => ({ kind: 'editBlock', itemId })

export const toMicroStart = (itemId: string): View => ({ kind: 'microStart', itemId })

export const toNewBlock = (dayIndex: number): View => ({ kind: 'newBlock', dayIndex })
export const toNotices = (): View => ({ kind: 'notices' })

/**
 * One level up: the Back button's rule (Ruling 60).
 *
 * NOT the way out. The close control leaves entirely and never consults this, which is the
 * distinction `Cancel` could not make -- it meant "up one" inside a sub-flow and "give up"
 * at the chooser, and which one you got depended on the sheet you were in.
 *
 * A block returns to the week it was opened from, and an add sub-flow to the chooser it
 * was chosen from. Everything else was opened straight from the room and returns there.
 */
export const back = (view: View): View => {
  if (view.kind === 'block') return WEEK
  // Not the week: the form was opened from the block it edits, and skipping that level
  // would make Back and the close control mean the same thing again.
  if (view.kind === 'editBlock') return toBlock(view.itemId)
  // Same rule, same reason: the page is opened FROM the block, so one level up is the block.
  if (view.kind === 'microStart') return toBlock(view.itemId)
  if (view.kind === 'rebalance' || view.kind === 'newBlock') return WEEK
  if (view.kind === 'add' && view.way !== null) return toAdd()
  return ROOM
}

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
    case 'rebalance':
      return '/week/rebalance'
    case 'editBlock':
      return `/week/block/${encodeURIComponent(view.itemId)}/edit`
    case 'microStart':
      return `/week/block/${encodeURIComponent(view.itemId)}/start`
    case 'newBlock':
      return `/week/new/${view.dayIndex}`
    case 'notices':
      return '/notices'
    case 'rest':
      return '/rest'
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
    if (parts.length === 2 && second === 'rebalance') return REBALANCE

    if (second === 'block' && third !== undefined) {
      if (parts.length === 3) return toBlock(decodeURIComponent(third))
      if (parts.length === 4 && parts[3] === 'edit') return toEditBlock(decodeURIComponent(third))
      if (parts.length === 4 && parts[3] === 'start') return toMicroStart(decodeURIComponent(third))
    }

    /*
     * Bounds-checked rather than trusted. Every other segment in this address space is a
     * fixed word or an opaque id, and this is the one a person can plausibly edit by hand
     * into something meaningless -- a form opened onto day 99 would draw a picker over a day
     * that does not exist. Compared back as a string as well, so `08` and `1e1` do not read
     * as days whose canonical address is spelt differently.
     */
    if (parts.length === 3 && second === 'new' && third !== undefined) {
      const dayIndex = Number(third)
      const real = third === String(dayIndex) && dayIndex >= 0 && dayIndex < HORIZON_DAYS

      return real ? toNewBlock(dayIndex) : ROOM
    }

    return ROOM
  }

  if (first === 'settings' && parts.length === 1) return toSettings()

  if (first === 'reserves' && parts.length === 1) return toReserves()

  if (first === 'notices' && parts.length === 1) return toNotices()

  if (first === 'rest' && parts.length === 1) return REST

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
