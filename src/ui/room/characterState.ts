export type CharacterState = 'flattened' | 'runningLow' | 'holdingOn' | 'steady' | 'rested'

/**
 * §1.3's five states: flattened, running low, holding on, steady, rested.
 *
 * There is deliberately nothing below "flattened". The character reflects, never scolds
 * -- no death, no failure state, nothing the student can lose. It is a mirror, and a
 * sixth, worse state would quietly turn it into a pet: something you can neglect, which
 * creates obligation, and obligation is more load.
 */
export function characterStateFor(floorReserve: number): CharacterState {
  if (floorReserve < 10) return 'flattened'
  if (floorReserve < 25) return 'runningLow'
  if (floorReserve < 45) return 'holdingOn'
  if (floorReserve < 70) return 'steady'

  return 'rested'
}
