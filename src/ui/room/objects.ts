/**
 * What each piece of furniture is, and what touching it opens.
 *
 * §1.3's nine bindings were designed to *show state* -- the plant reflects sleep, the ceiling
 * reflects load. Being a *control* is a different job, and some features have no state to
 * reflect: a desk does not represent a reserve, it is simply where work goes. So three
 * objects are added here. All nine bindings survive untouched.
 */

/** What a zoomed object shows. Not the component itself -- the shell maps these to features,
 *  so this module stays free of React and can be tested as data. */
export type Opens =
  | 'input' // planner and photo import
  | 'outsideWorld' // request box and the chat channel
  | 'aboutYou' // calibration, "how you work", the account
  | 'confirmBlock'
  | 'microStart'
  | 'rest'
  | 'energyCheckIn'
  | 'accuracy'
  | 'rebalance'
  | 'capacity'

export type ClutterId = `clutter-${string}`

export type ObjectId =
  | 'desk'
  | 'phone'
  | 'mirror'
  | 'papers'
  | 'bed'
  | 'door'
  | 'character'
  | 'window'
  | 'ceiling'
  | 'plant'
  | 'light'
  | ClutterId

export interface ObjectMeta {
  readonly id: ObjectId
  /** What a person would call it, used as the accessible name and the sidebar row. */
  readonly label: string
  /** Null for objects that carry state and nothing else. */
  readonly opens: Opens | null
}

/** Stands in for however many clutter boxes there are. The model expands it into one entry
 *  per task, because the count is a property of the week rather than of the room. */
export const CLUTTER_PLACEHOLDER = 'clutter-*' as const

export const clutterIdFor = (itemId: string): ClutterId => `clutter-${itemId}`

export const isClutterId = (id: string): id is ClutterId => id.startsWith('clutter-')

/**
 * The traversal order, and the sidebar order.
 *
 * Fixed, and deliberately not sorted by urgency: a list that reorders itself has to be
 * re-learned on every visit by somebody using a screen reader, and a sighted student stops
 * trusting muscle memory in it. Attention is marked, never moved.
 *
 * Ordered roughly as the eye travels -- what you came to do, then what is asking for you,
 * then what is only reporting.
 */
export const OBJECT_ORDER = [
  'desk',
  'door',
  CLUTTER_PLACEHOLDER,
  'papers',
  'bed',
  'phone',
  'character',
  'mirror',
  'ceiling',
  'window',
  'plant',
  'light',
] as const satisfies readonly (ObjectId | typeof CLUTTER_PLACEHOLDER)[]

const META: Record<Exclude<ObjectId, ClutterId> | typeof CLUTTER_PLACEHOLDER, Omit<ObjectMeta, 'id'>> = {
  desk: { label: 'Plan my week', opens: 'input' },
  // §7 deleted the door's own outings menu -- the "getting outside" advice now lives in the
  // single recovery card, not behind a tap on the furniture. The door goes back to being a
  // pure readout, like the plant and the light: it reports lit or quiet and opens nothing.
  door: { label: 'Get outside', opens: null },
  [CLUTTER_PLACEHOLDER]: { label: 'Things to clear', opens: 'microStart' },
  papers: { label: 'What I did today', opens: 'confirmBlock' },
  bed: { label: 'How Im sleeping', opens: 'rest' },
  phone: { label: 'Someone asked me', opens: 'outsideWorld' },
  character: { label: 'How Im feeling', opens: 'energyCheckIn' },
  mirror: { label: 'How I work', opens: 'aboutYou' },
  ceiling: { label: 'Everything at once', opens: 'rebalance' },
  window: { label: 'The next three weeks', opens: 'accuracy' },
  // The plant reports its reading and nothing more. Tapping states the number rather than
  // doing nothing, because silence is what teaches somebody to stop tapping.
  plant: { label: 'Sleep and movement', opens: null },
  // The light already means the reserve, so §1.2's dial lives behind it.
  light: { label: 'Where my reserve is', opens: 'capacity' },
}

export function metaFor(id: ObjectId): ObjectMeta {
  if (isClutterId(id)) {
    return { id, ...META[CLUTTER_PLACEHOLDER] }
  }

  return { id, ...META[id] }
}
