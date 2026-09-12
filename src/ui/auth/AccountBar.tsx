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
 *
 * This then followed it into that bar rather than staying behind in the body, where it read
 * as one more setting among the radios and could scroll out of sight while the button that
 * signs that very account out stayed pinned. A label and the action it qualifies belong on
 * one line.
 */
export function AccountBar({
  session,
  /** Placement is the caller's, since this sits in a scrolling body in one sheet and in a
   *  pinned action bar in another, and only the caller knows which. */
  className = '',
}: {
  session: Session
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2 text-xs text-ink-soft ${className}`}>
      <Avatar email={session.email} name={session.name} avatarUrl={session.avatarUrl} />
      {/* truncate, and `min-w-0` on the row above it: a flex item will not shrink below its
          content without it, so a long Google display name would push Sign out off a 390px
          screen instead of ellipsing. */}
      <span className="truncate">{session.name ?? session.email}</span>
    </div>
  )
}
