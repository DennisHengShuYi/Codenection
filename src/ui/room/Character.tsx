import type { CharacterState } from './characterState'

/**
 * §1.3: posture, colour and expression, across the five states.
 *
 * The mouth goes from flat to a smile and never to a frown. That is not a detail — §1.3
 * says the character reflects rather than reproaches, and a frowning character is a
 * character telling the student off at the moment they can least take it.
 */
const POSTURE: Record<CharacterState, { slump: number; colour: string; mouth: string }> = {
  flattened: { slump: 14, colour: '#64748b', mouth: 'M -5 4 L 5 4' },
  runningLow: { slump: 10, colour: '#94a3b8', mouth: 'M -5 3 L 5 3' },
  holdingOn: { slump: 6, colour: '#a8a29e', mouth: 'M -5 2 L 5 2' },
  steady: { slump: 2, colour: '#34d399', mouth: 'M -5 1 Q 0 3 5 1' },
  rested: { slump: 0, colour: '#10b981', mouth: 'M -5 0 Q 0 4 5 0' },
}

export function Character({ state }: { state: CharacterState }) {
  const { slump, colour, mouth } = POSTURE[state]

  return (
    <g data-testid="room-character" data-state={state} transform={`translate(150 ${118 + slump})`}>
      <circle cx="0" cy="-14" r="9" fill={colour} />
      <path d={mouth} stroke="#0f172a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <rect x="-7" y="-4" width="14" height="20" rx="5" fill={colour} />
    </g>
  )
}
