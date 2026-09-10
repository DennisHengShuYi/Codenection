import type { Commitment } from '../../optimizer'

/**
 * The withdrawal, written in the student's own voice.
 *
 * A template rather than a model call: this appears when the app opens, and a screen that
 * has to wait on a network before it can tell you something lapsed is a screen that fails
 * exactly when the student most needs it to work.
 */
const withdrawalFor = (commitment: Commitment): string =>
  `I need to pull out of ${commitment.title}, and I am sorry for the short notice. I said yes hoping the next couple of weeks would ease up and they have not. I would rather tell you now than do it badly or drop it later.`

/**
 * §2.3's auto-expiry, at the surface.
 *
 * Students do not struggle to say no because they lack a reason; they struggle because
 * saying no requires an act. The commitment has already lapsed by the time this is shown --
 * the effort has changed direction, and all that is left is words the student can send.
 */
export function LapsedNotice({
  commitments,
  onDismiss,
}: {
  commitments: readonly Commitment[]
  onDismiss: () => void
}) {
  if (commitments.length === 0) return null

  return (
    <section
      data-testid="lapsed-notice"
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-attention bg-attention-soft p-4"
    >
      <div>
        <h2 className="text-lg font-medium">
          {commitments.length === 1
            ? 'One thing you said yes to has lapsed'
            : `${commitments.length} things you said yes to have lapsed`}
        </h2>
        <p className="text-sm text-ink-soft">
          You agreed to these provisionally, and your fortnight can no longer hold them. Here is
          what you could send.
        </p>
      </div>

      {commitments.map((commitment) => (
        <div key={commitment.id} data-testid={`lapsed-item-${commitment.id}`} className="flex flex-col gap-1">
          <p className="text-sm font-medium">{commitment.title}</p>
          <textarea
            data-testid={`withdrawal-${commitment.id}`}
            defaultValue={withdrawalFor(commitment)}
            rows={3}
            className="rounded border border-line p-2 text-sm"
          />
        </div>
      ))}

      <button type="button" onClick={onDismiss} className="self-start text-sm underline">
        Got it
      </button>
    </section>
  )
}
