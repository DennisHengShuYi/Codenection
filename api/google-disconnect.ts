import { createClient } from '@supabase/supabase-js'
import { unseal } from '../src/google/secretBox'
import { readServiceRoleKey, readSupabasePair, readSupabaseUrl } from '../src/data/serverEnv'
import { callerFrom } from '../src/data/sessionCheck'

/** Declared rather than inferred, matching the other endpoints. */
export const config = { runtime: 'edge' }

/**
 * Withdrawing the calendar grant, which ships with the feature rather than after it.
 *
 * Asking somebody for standing access to their calendar without a way to take it back is
 * not a thing to do, so this exists from the first commit and is reachable from settings
 * beside the Telegram unlink.
 *
 * Two steps, in this order, and the order is the point:
 *
 *   1. Tell Google to forget the grant. Deleting our row first would leave a live grant
 *      nobody holds a token for -- still listed on the student's Google account, still
 *      revocable only by them, and invisible to us.
 *   2. Delete our copy.
 *
 * If Google refuses, the row stays and the student is told, so the state on both sides still
 * matches. A disconnect that half-succeeded and reported success is worse than one that
 * failed honestly.
 *
 * The app's own calendar is deliberately NOT deleted. It holds blocks the student may have
 * come to rely on seeing, and removing a calendar full of their week without asking is
 * exactly the irreversible outward act this feature is careful about everywhere else. It is
 * theirs; they can delete it in Google if they want it gone.
 */

const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

export default async function handler(request: Request): Promise<Response> {
  // A write, so POST -- a disconnect must not be something a link or a prefetch can trigger.
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  // Read as a pair, never a URL from one place and a key from another: see
  // `readSupabasePair` for what that mismatch costs -- a signed-in student told to
  // sign in, with nothing anywhere saying the deployment is misconfigured.
  const env = process.env as Record<string, string | undefined>
  const pair = readSupabasePair(env)
  const supabaseUrl = readSupabaseUrl(env)
  const anonKey = pair?.anonKey
  const serviceRoleKey = readServiceRoleKey(env)
  const tokenKey = process.env.GOOGLE_TOKEN_KEY

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !tokenKey) {
    return new Response('Calendar connection is not available here.', { status: 503 })
  }

  const authorization = request.headers.get('authorization')
  if (authorization === null) return new Response('Sign in first.', { status: 401 })

  // Who is asking, checked against Supabase rather than decoded here -- a token this
  // endpoint parses itself is one whose signature it also has to verify, and getting that
  // subtly wrong is how an endpoint ends up trusting anything anyone mints.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error: refusal } = await asUser.auth.getUser()

  // Kept rather than discarded: Supabase refuses a bad session and a key that does not
  // belong to this project with the same 401, and only one of those is the student's to
  // fix. See `data/sessionCheck.ts`.
  if (refusal) console.warn('google-disconnect: could not verify a session --', refusal.message)

  const caller = callerFrom(data.user?.id, refusal)
  if (!caller.verifiable) {
    return new Response('Calendar is not available on this deployment.', { status: 503 })
  }
  const accountId = caller.accountId
  if (accountId === null) return new Response('Sign in first.', { status: 401 })

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: row } = await admin
    .from('google_credentials')
    .select('refresh_token_sealed')
    .eq('account_id', accountId)
    .maybeSingle()

  // Nothing connected is a success, not an error: the student asked for it to be gone and it
  // is gone. Saying "no connection found" would be pedantry about a state they wanted.
  if (!row) return new Response('ok')

  const token = await unseal(row.refresh_token_sealed as string, tokenKey)

  /**
   * A token we cannot open is one we can never revoke -- the key has rotated, or the row is
   * corrupt. Deleting it anyway is right: keeping an unopenable secret helps nobody, and the
   * student is told plainly that the grant has to be removed at Google, which is the only
   * place it can still be removed from.
   */
  if (token === null) {
    await admin.from('google_credentials').delete().eq('account_id', accountId)

    return new Response(
      'Disconnected here, but the permission could not be withdrawn automatically. ' +
        'Remove this app at myaccount.google.com/permissions.',
      { status: 200 },
    )
  }

  const revoked = await fetch(REVOKE_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => null)

  // Google refused or was unreachable. The row stays, so both sides still agree about what
  // is connected and a retry can finish the job.
  if (revoked === null || !revoked.ok) {
    return new Response('Could not reach Google to withdraw the permission. Nothing changed.', {
      status: 502,
    })
  }

  const { error } = await admin.from('google_credentials').delete().eq('account_id', accountId)
  if (error) return new Response('Withdrawn at Google, but the record could not be cleared.', { status: 500 })

  return new Response('ok')
}
