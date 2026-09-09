import type { ObjectId } from './objects'

/**
 * Where the student is, as one value.
 *
 * This replaces seven booleans on the old home screen -- `planning`, `photographing`,
 * `requesting`, `calibrating`, `selected`, and two dismissal flags. Between them those
 * permitted states the screen could not render, like planning and photographing at once. A
 * union makes those unrepresentable rather than merely unlikely.
 */
export type View =
  | { readonly kind: 'room' }
  | { readonly kind: 'zoom'; readonly objectId: ObjectId }
  | { readonly kind: 'words' }

export const ROOM: View = { kind: 'room' }

/** Replaces rather than nests: there is no stack, so going back always means the room. */
export const zoomTo = (_view: View, objectId: ObjectId): View => ({ kind: 'zoom', objectId })

export const toWords = (_view: View): View => ({ kind: 'words' })

export const back = (_view: View): View => ROOM
