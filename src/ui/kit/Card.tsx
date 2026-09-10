import type { HTMLAttributes } from 'react'

export type CardTone = 'attention' | 'calm'

/**
 * One card, three tones.
 *
 * Each feature used to bring its own: violet-50 for micro-start, sky-50 for the
 * prescription, amber-50 for the door panel, slate-100 for the drafts. The colours meant
 * nothing collectively -- they were just whatever the session that built each one reached
 * for.
 */
/**
 * Exported so a surface that cannot render `Card` itself -- a list item that must stay a
 * `<li>`, a status region with its own padding -- can still borrow the same colour pairing
 * instead of retyping it. `ItemChip`, `LapsedNotice` and `PreviewBanner` use this rather
 * than hand-rolling `border-attention bg-attention-soft` a fourth, fifth and sixth time.
 */
export const CARD_TONES: Record<CardTone, string> = {
  attention: 'border-attention bg-attention-soft',
  calm: 'border-calm bg-calm-soft',
}

export function Card({
  tone,
  className = '',
  ...rest
}: { tone?: CardTone } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      data-tone={tone ?? 'none'}
      className={`rounded-xl border p-4 ${tone ? CARD_TONES[tone] : 'border-line bg-surface'} ${className}`}
    />
  )
}
