/**
 * One number and one action (§1.5).
 *
 * The copy is as load-bearing as the layout. §1.3's rule -- the app reflects, never
 * scolds -- matters most here, because this is the screen a student reaches when they
 * are least able to absorb being told what they should have done. Nothing on it mentions
 * falling behind.
 */
export function LowEnergyView({
  capacity,
  action,
  onAction,
  onExit,
}: {
  capacity: number
  action: string
  onAction: () => void
  onExit: () => void
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-between p-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p data-testid="capacity-value" className="text-7xl font-semibold tabular-nums">
          {Math.round(capacity)}%
        </p>
        <p className="text-center text-sm opacity-80">That is where you are right now.</p>
      </div>

      {/* §0: primary actions in the lower half of the viewport, reachable one-handed. */}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onAction}
          className="w-full rounded-lg bg-slate-900 px-4 py-4 text-base font-medium text-white"
        >
          {action}
        </button>
        <button type="button" onClick={onExit} className="w-full px-4 py-2 text-sm underline">
          Show everything
        </button>
      </div>
    </main>
  )
}
