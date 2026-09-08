import type { CharacterState } from './characterState'
import { PLANT_DROOPS_BELOW, type RoomState } from './roomState'

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

/**
 * §1.5: a full text equivalent of every room object, as a primary view.
 *
 * The room needs this far more than the dial did. A dial at least has a number beside it;
 * a picture of a room carries nothing whatsoever to a screen reader, so anything left out
 * here is not merely unstyled for those users — it is absent.
 *
 * The copy follows §1.3's rule that the room reflects and never scolds. It says what is,
 * never what the student should have done.
 */
export function describeRoom(state: RoomState): string {
  const parts: string[] = [CHARACTER_WORDS[state.character], WEATHER_WORDS[state.weather]]

  if (state.clutter.length === 0) {
    parts.push('The floor is clear — nothing waiting.')
  } else {
    parts.push(`On the floor: ${state.clutter.map((box) => box.title).join(', ')}.`)
  }

  if (state.sleepDebt > 0) {
    const hours = Math.round(state.sleepDebt * 10) / 10
    parts.push(`The bed shows about ${hours} hours of sleep owed.`)
  }

  if (state.plantHealth < PLANT_DROOPS_BELOW) {
    parts.push('The plant is drooping.')
  }

  if (state.doorLit) {
    parts.push('The door is lit. Getting outside is the best thing available right now.')
  }

  return parts.join(' ')
}
