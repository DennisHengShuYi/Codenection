import type { Session } from '../../data'
import { Avatar } from './Avatar'

/**
 * Who is signed in.
 *
 * The name is preferred over the address when Google supplied one: a name is what a person
 * calls themselves, an address is what a database calls them. An email and password account
 * has no name, so it shows exactly what it always did.
 *
 * Sign-out used to live here as its own button, but that put the settings sheet's one real
 * action inside the scrolling body instead of the pinned action bar every other sheet uses
 * (§0.2's lower-half-primary rule) -- `RoomShell` now renders that button into `Sheet`'s
 * `actions` and this component is identity display only.
 */
export function AccountBar({ session }: { session: Session }) {
  return (
    <div className="flex items-center gap-2 text-xs text-ink-soft">
      <Avatar email={session.email} name={session.name} avatarUrl={session.avatarUrl} />
      {/* truncate: a long Google display name must not overflow a 390px screen. */}
      <span className="truncate">{session.name ?? session.email}</span>
    </div>
  )
}
