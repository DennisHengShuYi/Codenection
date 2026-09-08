export interface Session {
  readonly userId: string
  readonly email: string
  /** Both optional, and absent for every email and password account. Optional rather than
   *  nullable so an account created before this existed is still a valid session, and so
   *  the display can ask "is there one?" rather than "is it null or empty?". */
  readonly name?: string
  readonly avatarUrl?: string
}

export type AuthOutcome =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly message: string }

/** Supabase's own minimum. Checked client-side too, so an obviously short password is
 *  answered instantly rather than after a network round trip. */
export const MIN_PASSWORD_LENGTH = 6

/**
 * Supabase's error messages are written for developers. These are written for a student.
 *
 * The distinctions are the point. "That password is wrong" and "you never confirmed your
 * address" need completely different actions -- try again versus go and check your inbox
 * -- and collapsing them into "sign-in failed" is how an auth form becomes something
 * people give up on rather than get past.
 */
export function explainAuthError(message: string): string {
  const lower = message.toLowerCase()

  if (lower.includes('already registered')) {
    return 'That email address already has an account. Try signing in instead.'
  }

  if (lower.includes('not confirmed')) {
    return 'Check your inbox and confirm your email address, then sign in.'
  }

  if (lower.includes('invalid login credentials')) {
    return 'That email or password is not right.'
  }

  if (lower.includes('password')) {
    return `Your password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  return message
}
