import { CARD_TONES } from '../kit/Card'
import { Button } from '../kit/Button'

/**
 * The honest half of letting people use the app signed out.
 *
 * A preview that looked identical to the real thing would let somebody build a fortnight
 * believing it was being kept. Saying so plainly costs one line of screen space and is
 * the difference between a demo and a lie.
 */
export function PreviewBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div
      role="status"
      data-testid="preview-banner"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${CARD_TONES.attention}`}
    >
      <span>You are looking at a preview. This week is not being saved.</span>
      <Button variant="quiet" size="sm" onClick={onSignIn} className="font-medium">
        Create an account to keep it
      </Button>
    </div>
  )
}
