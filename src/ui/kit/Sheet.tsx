import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

/**
 * The container every button opens.
 *
 * Replaces `ZoomLayer`, keeping the three things it got right -- focus on open, Escape to
 * close, and real dialog semantics -- and fixing the one it got wrong. `ZoomLayer` put
 * "Back to the room" at the *top* and left each panel to place its own buttons wherever
 * they fell: mid-screen in the desk panel, after a paragraph in `Prescription`, under a
 * textarea in the planner. §0.2 wants primary actions in the lower half on mobile, so the
 * action bar is pinned here and panels stop deciding.
 *
 * Below 768px it takes the viewport, because a brain-dump box squeezed into a corner of a
 * phone is unusable. Above it, it is a card sized to what it HOLDS, centred over a dimmed
 * backdrop with the room still visible around it.
 *
 * That sizing is Ruling 58. The old geometry was `md:inset-y-8`, which made every sheet as
 * tall as the viewport whatever was inside it: the settings sheet -- three radios and one
 * sentence -- filled a 1440x900 screen with two thirds of it blank, and there was no
 * backdrop at all, so nothing dimmed the room and a click outside the panel did nothing.
 *
 * Focus is taken once, on mount, rather than whenever `title` changes. `ZoomLayer` keyed the
 * same effect on `objectId`, which is unique per object; `title` is a display string with no
 * such guarantee -- two different opens can share one ("Note", "Note"), and a title can also
 * change for reasons that have nothing to do with a new open (a live word count, say) while
 * the sheet stays mounted. Keying on it either misses a real swap that happens to keep the
 * same title, or steals focus from whatever the user is doing inside the body when the title
 * changes without one. A consumer that keeps `Sheet` in the same JSX position and swaps its
 * content in place -- rather than mounting a fresh one, which every current consumer does --
 * must pass a `key` so React remounts it; that remount is what moves focus, not the title.
 *
 * What this deliberately still does NOT do is trap Tab inside the panel, which
 * `aria-modal="true"` claims. That gap is real and predates this component; it is left to
 * be closed knowingly rather than smuggled in behind a redesign.
 */
/**
 * Two widths, owned here rather than by the caller.
 *
 * `wide` exists for the week's calendar (Ruling 59): seven day columns and an hour gutter
 * do not fit a reading-width card. Everything else is `default`, and a caller that wants a
 * third width should be asking whether its content belongs in a sheet at all.
 */
const WIDTH = {
  default: 'md:max-w-lg',
  wide: 'md:max-w-3xl',
} as const

export function Sheet({
  title,
  onClose,
  actions,
  children,
  size = 'default',
  onBack,
}: {
  title: string
  /** Done with this entirely. Closes the sheet whatever depth it was opened to -- never
   *  "up one level", which is what `onBack` is for. */
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
  size?: keyof typeof WIDTH
  /**
   * Ruling 60: up one level, where there IS one.
   *
   * Rendered by the container rather than by each caller, so three sub-flows cannot end up
   * with three slightly different back buttons -- which is how `Cancel` came to mean "go up
   * one" in some sheets and "give up entirely" in others. Omitted by a sheet opened
   * straight from the room, which would otherwise carry two controls doing one job.
   */
  onBack?: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)

  /**
   * Where the pointer went DOWN.
   *
   * A drag that starts on a word inside the panel and releases outside it is a student
   * selecting text, and the browser reports that release as a click on the backdrop. Acting
   * on the click alone would throw away whatever they were doing, so the backdrop closes
   * only when the press and the release both landed on it.
   */
  const pressedOnBackdrop = useRef(false)

  useEffect(() => {
    panel.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // The page behind a modal must not scroll under it. Restored to whatever it was rather
  // than blanked, so a sheet opened over an already-locked page cannot unlock it on close.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div
      data-testid="sheet-backdrop"
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose()
      }}
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/40 md:p-8 md:backdrop-blur-[2px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panel}
        tabIndex={-1}
        data-testid="sheet"
        /* Phone: the whole screen, square-cornered. From 768px: a centred card, as wide as
           it needs up to `max-w-lg` and as tall as its content up to `max-h`, at which
           point the body -- and only the body -- scrolls. */
        className={`flex h-dvh w-full flex-col bg-surface md:h-auto md:max-h-[min(90dvh,44rem)] md:rounded-2xl md:shadow-2xl md:ring-1 md:ring-black/10 ${WIDTH[size]}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-ground focus-visible:outline focus-visible:outline-2"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {(actions !== undefined || onBack !== undefined) && (
          <div
            data-testid="sheet-actions"
            /* Right-aligned as a group, in whatever order the caller passed. NOT reversed:
               the callers disagree about order on purpose -- `PlannerScreen` leads with its
               quiet action and ends on its primary, `BlockSheet` leads with the primary
               because its buttons are generated from a precedence list -- so a global flip
               would put one of them exactly backwards. Back is the exception: it is the
               container's own control and belongs at the far left, away from the actions
               that commit to something. */
            className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4"
          >
            {onBack !== undefined && (
              <Button variant="quiet" data-testid="sheet-back" onClick={onBack} className="mr-auto">
                <span aria-hidden="true">&lsaquo;</span> Back
              </Button>
            )}
            {actions}
          </div>
                )}
      </div>
    </div>
  )
}
