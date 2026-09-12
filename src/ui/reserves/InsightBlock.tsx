import { useEffect, useState } from 'react'
import { phraseInsight } from '../../ai/insight'

/**
 * What the numbers on this sheet mean for the student, under the numbers themselves.
 *
 * The sheet drew four bars, a projection and §1.5's text equivalent -- and the text
 * equivalent is a restatement by design, because it IS the dial for a screen reader and
 * interpretation mixed into it would be indistinguishable from a reading. So none of the
 * sheet said what any of it meant. This is that, kept separate for exactly that reason.
 *
 * The facts come in already computed by `domain/reserveInsight`, from the same projection
 * the dial above is drawing. The model is asked only to phrase them, and a reply that adds
 * a claim or drops a warning is refused before it reaches here (`ai/insightSchema`). §8.2
 * is the rule underneath: the app may never describe a week the model did not simulate.
 */
export function InsightBlock({ lines }: { readonly lines: readonly string[] }) {
  /*
   * The computed wording is what renders first, always.
   *
   * Not a spinner and not an empty box: these lines are already true and already complete,
   * so there is nothing to wait for. The model's version replaces them if and when it
   * arrives, and a student who never notices the swap has lost nothing -- which is the same
   * bargain `ai/insight` strikes on the other side of the call.
   */
  const [shown, setShown] = useState(lines)

  useEffect(() => {
    setShown(lines)

    let live = true

    void phraseInsight(lines).then((phrased) => {
      if (live) setShown(phrased)
    })

    // A sheet closed while the call is in flight. Without this the reply lands on an
    // unmounted component, and on a slow connection that is the normal case rather than
    // the edge one.
    return () => {
      live = false
    }
    // Joined rather than passed as the array itself: a caller that rebuilds the same lines
    // on every render would otherwise re-ask the model on every render.
  }, [lines.join('\n')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (shown.length === 0) return null

  return (
    <section data-testid="reserve-insight" className="mt-5 border-t border-line pt-4">
      <h3 className="text-xs uppercase tracking-wide text-ink-soft">What this means</h3>

      <ul className="mt-2 flex flex-col gap-2">
        {shown.map((line) => (
          <li key={line} className="text-sm text-ink">
            {line}
          </li>
        ))}
      </ul>
    </section>
  )
}
