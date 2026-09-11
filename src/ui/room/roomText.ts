import type { CharacterState } from './characterState'
import type { RoomState } from './roomState'

const CHARACTER_WORDS: Record<CharacterState, string> = {
  flattened: 'You are flattened right now.',
  runningLow: 'You are running low.',
  holdingOn: 'You are holding on.',
  steady: 'You are steady.',
  rested: 'You are rested.',
}

const WEATHER_WORDS: Record<RoomState['weather'], string> = {
  clear: 'Through the window it is clear — nothing on the horizon takes you under.',
  clouding: 'Through the window it is clouding over — there is a rough patch further out.',
  storm: 'Through the window there is a storm coming, and it is close.',
}

const FLOOR_CLEAR_SENTENCE = 'The floor is clear — nothing waiting.'

/** Null when the floor has nothing on it, so the capped paragraph can treat "something is
 *  waiting" as one of its optional slots rather than something always shown. */
const clutterItemsSentence = (state: RoomState): string | null =>
  state.clutter.length === 0
    ? null
    : `On the floor: ${state.clutter.map((box) => box.title).join(', ')}.`

/** The unconditional version `describeRoomFully` uses: always says something about the
 *  floor, clear or not. */
const clutterSentence = (state: RoomState): string => clutterItemsSentence(state) ?? FLOOR_CLEAR_SENTENCE

const sleepSentence = (state: RoomState): string | null => {
  if (state.sleepDebt <= 0) return null

  const hours = Math.round(state.sleepDebt * 10) / 10
  return `The bed shows about ${hours} hours of sleep owed.`
}

/**
 * Ruling 45: what today puts in the room, in place of the plant that read a reserve.
 *
 * One sentence covering both objects, because a paragraph that lists furniture one item per
 * sentence reads as an inventory. Said only when there is something to say.
 */
const todaySentence = (state: RoomState): string | null => {
  const here: string[] = []
  if (state.paperHeight > 0) here.push('books out on the desk')
  if (state.exerciseWaiting > 0) here.push('a dumbbell on the floor')
  if (state.companyWaiting > 0) here.push('people here')

  if (here.length === 0) return null
  if (here.length === 1) return `There ${here[0] === 'people here' ? 'are' : 'are'} ${here[0]}.`

  return `There are ${here.slice(0, -1).join(', ')} and ${here[here.length - 1]}.`
}

/** Ruling 45: the day that does not fit, said in words. The drawing dims; a screen reader needs
 *  the same fact stated, or the two audiences are told different things. */
const SPILLING_ABOVE = 0

const spillSentence = (state: RoomState): string | null =>
  state.windowDark > SPILLING_ABOVE
    ? 'The room is dim — today asks for more hours than the day has, and the difference comes out of sleep.'
    : null

const doorSentence = (state: RoomState): string | null =>
  state.doorLit ? 'The door is lit. Getting outside is the best thing available right now.' : null

/** One sentence, for the capped paragraph -- the two-sentence version above is fine when
 *  it is the whole story, but here it would use up two of three slots on its own. */
const doorSentenceShort = (state: RoomState): string | null =>
  state.doorLit ? 'The door is lit — getting outside is the best thing available right now.' : null

/**
 * §1.5: a full text equivalent of every room object, as a primary view.
 *
 * The room needs this far more than the dial did. A dial at least has a number beside it;
 * a picture of a room carries nothing whatsoever to a screen reader, so anything left out
 * here is not merely unstyled for those users — it is absent. This is the drawing's
 * `aria-label`: nothing here is trimmed for space, because there are no buttons beneath it
 * to lose their footing.
 *
 * The copy follows §1.3's rule that the room reflects and never scolds. It says what is,
 * never what the student should have done.
 */
export function describeRoomFully(state: RoomState): string {
  const parts = [
    CHARACTER_WORDS[state.character],
    WEATHER_WORDS[state.weather],
    spillSentence(state),
    clutterSentence(state),
    sleepSentence(state),
    todaySentence(state),
    doorSentence(state),
  ].filter((part): part is string => part !== null)

  return parts.join(' ')
}

/**
 * The same story, capped at three sentences so a 320px screen keeps its buttons above the
 * fold (the dial's own text equivalent and domain bars, not this paragraph, are what still
 * spell out every number).
 *
 * Character and weather stay always -- the drawing cannot say either any other way. Then
 * at most one more, in priority order: a day that does not fit, the door lit, sleep debt,
 * what is on the floor, rest waiting. The floor is always "applicable" in the sense that it
 * has something to say (clear or not), so it is what fills the slot when nothing more
 * urgent does.
 *
 * Ruling 45 put the spill first. It is the only sentence here about something the student can
 * still act on before it costs them the night -- the door is a suggestion, the floor is a
 * fact, and sleep debt is already spent.
 */
export function describeRoom(state: RoomState): string {
  const additional =
    spillSentence(state) ??
    doorSentenceShort(state) ??
    sleepSentence(state) ??
    clutterItemsSentence(state) ??
    todaySentence(state) ??
    FLOOR_CLEAR_SENTENCE

  const parts = [CHARACTER_WORDS[state.character], WEATHER_WORDS[state.weather], additional].filter(
    (part): part is string => part !== null,
  )

  return parts.join(' ')
}
