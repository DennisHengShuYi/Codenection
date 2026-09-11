/**
 * §3: which live cards the room screen shows, and how many.
 *
 * "How did today go?" is last because it asks the student for something rather than
 * offering them anything, and a depleted person should meet an offer before a request.
 *
 * The recovery card used to lead this list, because it was the only one addressing *why*
 * the others were hard. It is gone: §5's offer is the Rest button in the room's control
 * row now, which a student presses when they want it rather than being handed it on a day
 * the app decided they needed one. What remains here are the four cards that report
 * something rather than propose something.
 */
export type CardId = 'distress' | 'lapsed' | 'stuck' | 'today'

/**
 * Distress first.
 *
 * A student who has reported the bottom four days running is the one case where the room
 * has something to say before anything else, and under the low-energy cap it goes alone.
 */
const ORDER: readonly CardId[] = ['distress', 'lapsed', 'stuck', 'today']

/** §1.5: a student at 12% reserve should not be handed a dashboard, and two cards is a
 *  small dashboard. */
const CAP_LOW_ENERGY = 1
const CAP_NORMAL = 2

export function visibleCards(applies: {
  readonly distress: boolean
  readonly lapsed: boolean
  readonly stuck: boolean
  readonly today: boolean
  readonly lowEnergy: boolean
}): readonly CardId[] {
  return ORDER.filter((id) => applies[id]).slice(
    0,
    applies.lowEnergy ? CAP_LOW_ENERGY : CAP_NORMAL,
  )
}
