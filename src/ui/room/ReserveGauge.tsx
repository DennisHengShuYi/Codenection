/**
 * The reserve in the room's corner: a ring that fills with what is left, and the number
 * inside it.
 *
 * This was a white pill with the percentage in `text-ink-soft`, and it had two problems. It
 * encoded no quantity -- 67% and 12% drew identically, so the one number the room exists to
 * surface carried no visual weight at all -- and it read as a badge rather than as the door
 * Ruling 59 made it. The arc fixes the first and the ring shape fixes the second.
 *
 * §1.5 is satisfied without needing colour at all: the arc length and the number say the same
 * thing twice over.
 *
 * And one tone rather than a red/amber/green band, which was the first attempt and was wrong.
 * `statusOf` -- the five bars' own thresholds -- calls 43% "healthy", so the gauge drew a calm
 * teal while the weather two inches away drew a storm, because the fortnight's FLOOR was 32
 * and it crossed into deficit on day one. Those bands are calibrated for a single reserve
 * type; this figure is the mean of four. Judgement about the week is already carried by the
 * weather, the light and the character, and a fourth channel here could only disagree with
 * them. So the arc reports the quantity and claims nothing about it.
 *
 * Deliberately NOT the semicircle `CapacityDial` draws, and worth saying why since they show
 * the same figure. That one is the instrument: an arc wide enough to read a needle against,
 * with the bars and the spoken summary under it. This is a 44px glance readout that has to
 * stay a legal touch target, and a semicircle inside 44px spends half its box on nothing and
 * crushes the number. Different job, different form.
 */

/** Geometry. A 44px box is the minimum touch target, so the ring is drawn to fill it. */
const SIZE = 44
const CENTRE = SIZE / 2
const RADIUS = 18
const STROKE = 3.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ReserveGauge({ percent }: { readonly percent: number }) {
  // Clamped for drawing only. The number shown is whatever it was given: a gauge that
  // silently rounded a figure into range would be the drawing disagreeing with the reading.
  const filled = Math.min(100, Math.max(0, percent))

  return (
    <>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        {/* The whole ring, so the unfilled part is visibly the rest of a known total rather
            than absence. Without it a two-thirds arc reads as a decorative flourish. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          className="text-line"
        />

        {/* What is left. Rotated so it starts at twelve o'clock, which is where a gauge is
            read from, and round-capped so a nearly-empty reserve is still a visible mark
            rather than nothing at all. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - filled / 100)}
          transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
          className="text-ink"
        />
      </svg>

      {/* `text-ink`, not `text-ink-soft`. This is the headline figure of the whole screen and
          it was being drawn in the colour the app uses to de-emphasise things. */}
      <span className="relative text-[0.8125rem] font-semibold leading-none text-ink tabular-nums">
        {percent}%
      </span>
    </>
  )
}
