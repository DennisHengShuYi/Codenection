import { cloneElement, useId, type ReactElement } from 'react'

/**
 * Label, control, help, error -- wired together rather than hoped for.
 *
 * The forms in this app were each built with their own <label> markup, and two of them
 * described their inputs with plain text that no screen reader ever connected to the
 * control. This makes the wiring the default.
 */
export function Field({
  label,
  help,
  error,
  children,
  hideLabel = false,
}: {
  label: string
  help?: string
  error?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
  /**
   * Keeps the accessible name but hides the label visually. For a control whose
   * surrounding copy already says what it is -- `LapsedNotice`'s "Withdrawal message",
   * sitting directly under a sentence that already named it -- a visible label repeats
   * something the student just read, at a moment (withdrawing from a commitment) that is
   * already asking enough of them. The label stays in the accessibility tree either way,
   * so nothing is lost for a screen-reader user; only the sighted repetition goes.
   */
  hideLabel?: boolean
}) {
  const id = useId()
  const noteId = `${id}-note`
  // The error replaces the help rather than joining it: two descriptions read out in
  // sequence is how a screen-reader user hears "roughly is fine that is not a number".
  const note = error ?? help

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>
        {label}
      </label>

      {cloneElement(children, {
        id,
        'aria-describedby': note === undefined ? undefined : noteId,
        'aria-invalid': error === undefined ? undefined : true,
      })}

      {note !== undefined && (
        <p
          id={noteId}
          role={error === undefined ? undefined : 'alert'}
          className={`text-xs ${error === undefined ? 'text-ink-soft' : 'text-attention'}`}
        >
          {note}
        </p>
      )}
    </div>
  )
}
