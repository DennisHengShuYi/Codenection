import { accuracyLine, type EnergyPrediction } from '../../domain/predictions'

/**
 * §8.1's published number, and §8.2's disclaimer beside it.
 *
 * §8.2 is explicit that the 21-day projection is never described as validated, and that this
 * has to be said **in the product copy, not only in the pitch**. So it lives here, on screen,
 * next to the number that *is* measured — where a student reads it rather than where a judge
 * does. There is a test asserting it.
 *
 * The two claims are deliberately adjacent: one is scored and the other is not, and putting
 * them together is what stops the honest number lending credibility to the unproven one.
 */
export function AccuracyNote({ predictions }: { predictions: readonly EnergyPrediction[] }) {
  return (
    <section data-testid="accuracy-note" className="flex flex-col gap-1 text-xs opacity-80">
      <p data-testid="accuracy-measured">{accuracyLine(predictions)}</p>
      <p data-testid="accuracy-disclaimer">
        The three-week outlook is not a validated prediction. It is a decision aid — it shows
        where you are heading if nothing changes, and things usually change.
      </p>
    </section>
  )
}
