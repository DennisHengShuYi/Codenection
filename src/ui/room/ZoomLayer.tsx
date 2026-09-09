import { useEffect, useRef, type ReactNode } from 'react'
import { metaFor, type ObjectId } from './objects'

/**
 * A feature, rendered as though you had walked up to the object.
 *
 * Above 768px the room stays visible around the edges, so the metaphor is shown rather than
 * asserted. Below it the layer takes the viewport, because a brain-dump box or a 3x24 grid
 * squeezed into a corner of a phone is unusable -- and a usable form matters more than a
 * consistent illusion.
 *
 * Focus moves in on open and Escape closes. Without that, somebody using a keyboard opens a
 * form and is left at the top of the document with no way back.
 */
export function ZoomLayer({
  objectId,
  onClose,
  children,
}: {
  objectId: ObjectId
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panel.current?.focus()
  }, [objectId])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      data-testid={`zoom-${objectId}`}
      role="dialog"
      aria-modal="true"
      aria-label={metaFor(objectId).label}
      ref={panel}
      tabIndex={-1}
      className="fixed inset-0 z-10 overflow-y-auto bg-white p-4 md:inset-8 md:rounded-xl md:shadow-2xl md:ring-1 md:ring-slate-900/10"
    >
      <button type="button" onClick={onClose} data-testid="zoom-back" className="mb-2 text-sm underline">
        Back to the room
      </button>

      {children}
    </div>
  )
}
