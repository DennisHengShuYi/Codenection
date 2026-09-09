import { useEffect, useRef, type ReactNode } from 'react'

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
 * phone is unusable. Above it, it centres and the room stays visible around the edges.
 */
export function Sheet({
  title,
  onClose,
  actions,
  children,
}: {
  title: string
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
  }, [title])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={panel}
      tabIndex={-1}
      data-testid="sheet"
      className="fixed inset-0 z-20 flex flex-col bg-surface md:inset-x-[12.5%] md:inset-y-8 md:rounded-2xl md:shadow-2xl md:ring-1 md:ring-black/10"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line p-4">
        <h2 className="text-lg font-medium text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-ink-soft focus-visible:outline focus-visible:outline-2"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

      {actions !== undefined && (
        <div
          data-testid="sheet-actions"
          className="flex shrink-0 flex-wrap gap-2 border-t border-line p-4"
        >
          {actions}
        </div>
      )}
    </div>
  )
}
