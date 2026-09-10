/**
 * Where the student is, as one value.
 *
 * §3 replaces the room's own zoom-on-an-object model with routing between two screens, a
 * sheet, and settings. There is still no stack for most of it -- opening `add` or
 * `settings` always starts from the room and closing always returns to it -- with one
 * deliberate exception: a block is opened from the week, not from the room, so closing it
 * has to leave you where you opened it rather than skipping past the week back to the
 * room. That is the one place a stack is worth having.
 */
export type View =
  | { readonly kind: 'room' }
  | { readonly kind: 'week' }
  | { readonly kind: 'block'; readonly itemId: string }
  | { readonly kind: 'add' }
  | { readonly kind: 'settings' }

export const ROOM: View = { kind: 'room' }
// Not exported: `toWeek()` and `back()` are the module's whole surface for it.
const WEEK: View = { kind: 'week' }

export const toWeek = (): View => WEEK

export const toBlock = (itemId: string): View => ({ kind: 'block', itemId })

export const toAdd = (): View => ({ kind: 'add' })

export const toSettings = (): View => ({ kind: 'settings' })

/** Everywhere returns to the room -- except a block, which returns to the week it was
 *  opened from. */
export const back = (view: View): View => (view.kind === 'block' ? WEEK : ROOM)
