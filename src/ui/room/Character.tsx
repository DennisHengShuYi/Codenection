import { Shadow } from './scene/marks'
import { FLOOR_Y, PALETTE } from './scene/palette'
import type { CharacterState } from './characterState'

/**
 * §1.3: posture, colour and expression, across the five states.
 *
 * The mouth goes from flat to a smile and never to a frown. That is not a detail — §1.3
 * says the character reflects rather than reproaches, and a frowning character is a
 * character telling the student off at the moment they can least take it.
 *
 * The origin is the character's *feet*, on the floor line, and the slump compresses the body
 * upward from there. It used to translate the whole figure down instead, which meant a
 * rested character stood twelve units above the floor with its contact shadow cast on the
 * wall behind it — and it is not how slumping works either. Feet stay; the head comes down.
 */
const POSTURE: Record<CharacterState, { slump: number; colour: string; mouth: string }> = {
  flattened: { slump: 14, colour: '#8d8378', mouth: 'M -5 4 L 5 4' },
  runningLow: { slump: 10, colour: '#a89c8d', mouth: 'M -5 3 L 5 3' },
  holdingOn: { slump: 6, colour: '#b5a894', mouth: 'M -5 2 L 5 2' },
  steady: { slump: 2, colour: '#5cb37e', mouth: 'M -5 1 Q 0 3 5 1' },
  rested: { slump: 0, colour: '#3f9e6b', mouth: 'M -5 0 Q 0 4 5 0' },
}

export function Character({ state }: { state: CharacterState }) {
  const { slump, colour, mouth } = POSTURE[state]

  /** The body shortens rather than descends, so the feet never leave the floor. */
  const shoulder = -16 + slump * 0.5
  /** Kept within the head's own radius of the shoulders, or the neck opens into a gap and
   *  the head reads as floating above the body rather than sitting on it. */
  const head = shoulder - 8 + slump * 0.25

  return (
    <g data-testid="room-character" data-state={state}>
      <Shadow cx={150} cy={FLOOR_Y} rx={12} />

      <g transform={`translate(150 ${FLOOR_Y})`}>
        <rect x="-7" y={shoulder} width="14" height={-shoulder} rx="5" fill={colour} />
        {/* Arms, drawn before the head so the head sits over the shoulders. They hang lower
            as the slump deepens, which is most of what makes the posture read at this size. */}
        <path
          d={`M -7 ${shoulder + 4} Q -11 ${shoulder + 9 + slump * 0.3} -9 ${shoulder + 15}`}
          stroke={colour}
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M 7 ${shoulder + 4} Q 11 ${shoulder + 9 + slump * 0.3} 9 ${shoulder + 15}`}
          stroke={colour}
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="0" cy={head} r="9" fill={colour} />
        <circle cx="-3.2" cy={head - 1.5} r="1.1" fill={PALETTE.ink} />
        <circle cx="3.2" cy={head - 1.5} r="1.1" fill={PALETTE.ink} />
        <path
          d={mouth}
          stroke={PALETTE.ink}
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
          transform={`translate(0 ${head + 3})`}
        />
      </g>
    </g>
  )
}
