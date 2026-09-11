import { CARD_TONES } from '../kit/Card'
import { Button } from '../kit/Button'

/**
 * The honest half of letting people use the app signed out.
 *
 * A preview that looked identical to the real thing would let somebody build a fortnight
 * believing it was being kept. Saying so plainly costs one line of screen space and is
 * the difference between a demo and a lie.
 *
 * Which is why the wording had to change, twice.
 *
 * It first said "this week is not being saved", and it *is*: `createRepository` hands a
 * signed-out visitor a local store, which writes the week, the settings and the block log to
 * IndexedDB. A student who closed the tab and came back found their fortnight intact, having
 * just been told it was gone. The true limit is the device and the account, not persistence.
 *
 * Then it said "sign in to keep it everywhere", which was true only while `carryOverWeek`
 * moved the preview into the new account. That is gone: it could not tell a week a student
 * had actually built from the demo one the app seeds them, so every new account was born
 * holding somebody else's timetable. **The preview is only ever a preview**, and the banner
 * has to say so before somebody spends an evening building a fortnight here -- which is the
 * same duty the first correction was about, pointing the other way.
 */
export function PreviewBanner({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div
      role="status"
      data-testid="preview-banner"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${CARD_TONES.attention}`}
    >
      <span>Saved on this device only. Signing in starts a fresh week.</span>
      <Button variant="quiet" size="sm" onClick={onSignIn} className="font-medium">
        Create an account
      </Button>
    </div>
  )
}
