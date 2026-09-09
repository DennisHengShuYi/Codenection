import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'
export type ButtonSize = 'lg' | 'sm'

/**
 * The only button in the app.
 *
 * `rounded-lg bg-slate-900 px-4 py-3 text-white` was hand-written eighteen times across
 * twelve files, which is how the app ended up with three different secondary buttons and
 * no way to change any of them at once.
 *
 * Every variant clears 44px, including `quiet` -- a text link is still something a thumb
 * has to hit, and the underlined "Not now" links this replaces were 20px tall.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white',
  secondary: 'border border-line bg-surface text-ink',
  quiet: 'text-ink-soft underline underline-offset-2',
}

const SIZES: Record<ButtonSize, string> = {
  lg: 'min-h-11 px-4 py-3 text-sm',
  sm: 'min-h-11 px-3 py-2 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'lg',
  className = '',
  type = 'button',
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      // Defaulted rather than required: a bare <button> inside a form submits it, and that
      // bug is invisible until the one screen that has a form.
      type={type}
      data-variant={variant}
      data-size={size}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 motion-reduce:transition-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}
