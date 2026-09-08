export function AccountBar({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs opacity-70">
      <span>{email}</span>
      <button type="button" onClick={onSignOut} className="underline">
        Sign out
      </button>
    </div>
  )
}
