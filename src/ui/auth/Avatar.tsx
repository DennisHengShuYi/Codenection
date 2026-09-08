import { useState } from 'react'

/** What a screen reader should say. The name if there is one, the address otherwise -- an
 *  image address read aloud tells nobody anything. */
const describe = (name: string | undefined, email: string) => name ?? email ?? ''

/** Falls back through name, then address, then a neutral mark, so an account with neither
 *  still renders something rather than an empty circle. */
const initial = (name: string | undefined, email: string) => {
  const source = (name ?? email).trim()
  return source === '' ? '·' : source.charAt(0).toUpperCase()
}

/**
 * The person signed in, as a picture when there is one and an initial when there is not.
 *
 * Google supplies a photo; every email and password account has none, so the initial is the
 * common case rather than the exception. A photo address can also expire, 404, or be
 * blocked by an extension -- a broken image in the corner of the screen reads as a broken
 * app, so a load failure falls back to exactly the same initial.
 */
export function Avatar({
  email,
  name,
  avatarUrl,
}: {
  email: string
  name?: string
  avatarUrl?: string
}) {
  const [failed, setFailed] = useState(false)

  const shared =
    'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-medium text-slate-700'

  if (avatarUrl !== undefined && !failed) {
    return (
      <img
        data-testid="avatar"
        src={avatarUrl}
        alt={describe(name, email)}
        onError={() => setFailed(true)}
        className={shared}
      />
    )
  }

  return (
    // aria-hidden: the bar already carries the name or address as text beside this, and a
    // screen reader announcing the initial as well would say the same person twice.
    <span data-testid="avatar" aria-hidden="true" className={shared}>
      {initial(name, email)}
    </span>
  )
}
