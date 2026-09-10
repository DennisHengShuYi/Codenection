/**
 * §3: which live cards the room screen shows, and how many.
 *
 * Recovery leads because it is the only one that addresses *why* the others are hard.
 * "How did today go?" is last because it asks the student for something rather than
 * offering them anything, and a depleted person should meet an offer before a request.
 */
export type CardId = 'distress' | 'recovery' | 'lapsed' | 'stuck' | 'today'

/**
 * Distress sits above recovery, which otherwise leads.
 *
 * Recovery leads normally because it addresses *why* the other cards are hard. It does not
 * address this one. A student who has reported the bottom four days running is not helped
 * by being offered a walk, and putting that first would read as the app not having heard
 * them -- so on the rare occasion this applies, it goes first and, under the low-energy
 * cap, alone.
 */
const ORDER: readonly CardId[] = ['distress', 'recovery', 'lapsed', 'stuck', 'today']

/** §1.5: a student at 12% reserve should not be handed a dashboard, and two cards is a
 *  small dashboard. */
const CAP_LOW_ENERGY = 1
const CAP_NORMAL = 2

export function visibleCards(applies: {
  readonly distress: boolean
  readonly recovery: boolean
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
