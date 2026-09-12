/**
 * §3: which live cards the room screen shows, and how many.
 *
 * "How did today go?" is last because it asks the student for something rather than
 * offering them anything, and a depleted person should meet an offer before a request.
 *
 * The recovery card used to lead this list, because it was the only one addressing *why*
 * the others were hard. It is gone: §5's offer is the Rest button in the room's control
 * row now, which a student presses when they want it rather than being handed it on a day
 * the app decided they needed one.
 *
 * The micro-start card stays, and is the one card here that proposes rather than reports. It
 * earns that by when it appears: §4.1's trigger is the block's own slot, so it arrives at the
 * moment the student is supposed to be doing the thing rather than at an hour the app chose.
 * A student sitting in a slot they cannot start is the case §4.1 exists for, and an offer
 * then is not an interruption -- it is the answer to the question they are already stuck on.
 */
export type CardId = 'distress' | 'overfull' | 'stuck' | 'today'

/**
 * Distress first.
 *
 * A student who has reported the bottom four days running is the one case where the room
 * has something to say before anything else, and under the low-energy cap it goes alone.
 */
const ORDER: readonly CardId[] = ['distress', 'overfull', 'stuck', 'today']

/**
 * §1.5: a student at 12% reserve should not be handed a dashboard.
 *
 * The low-energy cap of one is that rule, and it is not up for trading. It is also the only
 * cap here still deciding anything: the normal limit is the number of cards there are, so
 * above the threshold this filters and orders but never withholds.
 *
 * It was two, then three, and each number was quietly choosing which of four real things a
 * student would not be told. At two the micro-start card lost to distress and a lapsed
 * commitment together, so on the worst day -- in the very slot they were supposed to be
 * working -- the sheet reported two things that had gone wrong and offered no way in. At
 * three the sleep question went instead. Both were the wrong loss, and any other order only
 * moves the loss somewhere else: these are four different facts about one day, and none of
 * them is the one that deserves to vanish.
 *
 * What makes that safe is where this sheet lives. It is behind the `Waiting` button, opened
 * when a student asks for it, with a count on the button so they can decide not to -- which
 * is the protection §1.5 actually wanted. A card is only forced on somebody below the
 * threshold, and there they still get exactly one.
 */
const CAP_LOW_ENERGY = 1
const CAP_NORMAL = 4

export function visibleCards(applies: {
  readonly distress: boolean
  readonly overfull: boolean
  readonly stuck: boolean
  readonly today: boolean
  readonly lowEnergy: boolean
}): readonly CardId[] {
  return ORDER.filter((id) => applies[id]).slice(
    0,
    applies.lowEnergy ? CAP_LOW_ENERGY : CAP_NORMAL,
  )
}
