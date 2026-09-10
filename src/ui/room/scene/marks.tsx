import { PALETTE } from './palette'

/**
 * What every object in the room shares: the mark that says what it stands on.
 *
 * It is here rather than repeated per object so that "how contact looks" is one edit rather
 * than a dozen, and so no object can quietly grow its own dialect for it.
 *
 * The source this was ported from also had a `Halo` -- an amber glow behind whichever object
 * was asking for the student's attention. It did not come across, and that is deliberate:
 * attention was read from `RoomModel.rows`, which §3 deleted along with the tap targets it
 * described. A `Halo` here would be a component nothing on this branch could ever switch on,
 * which is the exact shape of orphan this branch has produced nine times. If attention comes
 * back it comes back with a source.
 */

/**
 * A contact shadow, which is what stops an object floating.
 *
 * Deliberately soft and short: a hard shadow implies a single bright lamp, and the light in
 * this room is a state reading rather than a lighting decision.
 */
export function Shadow({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.18} fill={PALETTE.ink} opacity="0.14" />
}
