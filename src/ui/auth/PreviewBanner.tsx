import { CARD_TONES } from '../kit/Card'
import { Button } from '../kit/Button'

/**
 * The honest half of letting people use the app signed out.
 *
 * A preview that looked identical to the real thing would let somebody build a fortnight
 * believing it was being kept. Saying so plainly costs one line of screen space and is
 * the difference between a demo and a lie.
 *
 * Which is why the wording had to change. This said "this week is not being saved", and it
 * *is*: `createRepository` hands a signed-out visitor `createLocalRepository`, which writes
 * the week, the settings and the block log to IndexedDB -- and that store is exactly what
 * `carryOverWeek` later copies into a new account, *because* it was saved. So a student who
 * closed the tab and came back found their fortnight intact, having just been told it was
 * gone. The true limit is the device and the account, not persistence.
 */
export function PreviewBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div
      role="status"
      data-testid="preview-banner"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${CARD_TONES.attention}`}
    >
      <span>Saved on this device only. Sign in to keep it everywhere.</span>
      <Button variant="quiet" size="sm" onClick={onSignIn} className="font-medium">
        Create an account to keep it
      </Button>
    </div>
  )
}
