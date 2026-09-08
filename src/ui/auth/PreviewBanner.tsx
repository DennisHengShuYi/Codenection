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
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm"
    >
      <span>You are looking at a preview. This week is not being saved.</span>
      <button type="button" onClick={onSignIn} className="font-medium underline">
        Create an account to keep it
      </button>
    </div>
  )
}
