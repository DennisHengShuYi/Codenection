/**
 * The app shell. Deliberately thin: every screen this project adds hangs off here, and
 * the layout rules that matter are the standing requirements in §0 of the spec rather
 * than anything this component decides.
 *
 * `max-w-screen-md` with `mx-auto` is §10's "max content width capped, centred" rule --
 * the room and the digest must never stretch across a full desktop viewport, because the
 * brief asks for something students keep on their phone and a bespoke desktop experience
 * works against that claim.
 */
export function App() {
  return (
    <main className="mx-auto max-w-screen-md p-4">
      <h1 className="text-2xl font-semibold">Codenection</h1>
      <p data-testid="status">Ready</p>
    </main>
  )
}
