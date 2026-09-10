import type { Session } from '../../data'
import { Button } from '../kit/Button'
import { Avatar } from './Avatar'

/**
 * Who is signed in, and the way out.
 *
 * The name is preferred over the address when Google supplied one: a name is what a person
 * calls themselves, an address is what a database calls them. An email and password account
 * has no name, so it shows exactly what it always did.
 */
export function AccountBar({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-ink-soft">
      <span className="flex min-w-0 items-center gap-2">
        <Avatar email={session.email} name={session.name} avatarUrl={session.avatarUrl} />
        {/* truncate: a long Google display name must not push the sign-out button off a
            390px screen. */}
        <span className="truncate">{session.name ?? session.email}</span>
      </span>

      <Button variant="quiet" size="sm" onClick={onSignOut} className="shrink-0">
        Sign out
      </Button>
    </div>
  )
}
