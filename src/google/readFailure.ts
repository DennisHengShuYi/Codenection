/**
 * Why Google refused to hand over a calendar, in terms the app can act on.
 *
 * `api/google-events.ts` answered every failed read with a flat 502 and threw the reason
 * away, so the screen said "I could not read your calendar just now. Try again in a moment."
 * to a student for whom trying again was not what fixes it -- and left nobody, including
 * whoever has to fix the deployment, any way of telling which failure it was.
 *
 * Pure and here rather than in `api/`, for `events.ts`'s reason one file over: the endpoint
 * stays a fetch with a credential, and what an answer MEANS is decided somewhere the unit
 * suite can reach.
 */

/** Google's error shape, as much of it as this needs. Everything is optional because it is a
 *  body from somebody else's server and may be anything at all. */
interface GoogleError {
  readonly error?: {
    readonly status?: unknown
    readonly message?: unknown
    readonly errors?: readonly { readonly reason?: unknown }[]
  }
}

export interface ReadFailure {
  /** What this endpoint should answer. */
  readonly status: 409 | 502 | 503
  /** One sentence for the student, or null where there is nothing honest to add beyond the
   *  screen's own "try again" -- which is the right answer for a transient fault. */
  readonly message: string | null
}

const RECONNECT =
  'Your calendar permission is missing something. Disconnect it in Settings and connect it again.'

const NOT_SET_UP =
  'Calendar reading is not switched on for this app yet, so there is nothing to read. This is ours to fix, not yours.'

const reasonsIn = (body: GoogleError): string =>
  [
    typeof body.error?.status === 'string' ? body.error.status : '',
    typeof body.error?.message === 'string' ? body.error.message : '',
    ...(body.error?.errors ?? []).map((entry) =>
      typeof entry?.reason === 'string' ? entry.reason : '',
    ),
  ]
    .join(' ')
    .toLowerCase()

/**
 * The three failures worth telling apart, and one bucket for everything else.
 *
 * - **The Calendar API is not enabled on the project.** Nothing the student can do, and
 *   "try again in a moment" is a lie: trying again is not what fixes it. 503, which is this
 *   app's word for "configured nowhere near here".
 * - **The grant does not carry the scope.** A student who connected before
 *   `calendar.readonly` was asked for has a token that cannot read anything, and no amount
 *   of retrying changes that -- reconnecting does, because consent asks again. 409, the same
 *   answer this endpoint already gives for a grant Google has stopped honouring.
 * - **Anything else**, including Google being briefly unwell. 502 and the screen's own
 *   sentence, which is the truth: try again in a moment.
 */
export function readFailureFor(httpStatus: number, body: unknown): ReadFailure {
  const reasons = reasonsIn((body ?? {}) as GoogleError)

  // Matched on the reason rather than on the status, because 403 carries both of the cases
  // below and they want opposite answers.
  if (reasons.includes('accessnotconfigured') || reasons.includes('has not been used in project')) {
    return { status: 503, message: NOT_SET_UP }
  }

  if (
    reasons.includes('insufficientpermissions') ||
    reasons.includes('insufficient authentication scopes') ||
    reasons.includes('request had insufficient authentication scopes') ||
    // 401 from the Calendar API with a token the refresh just minted is the same story: the
    // token is real and does not carry what this call needs.
    httpStatus === 401
  ) {
    return { status: 409, message: RECONNECT }
  }

  return { status: 502, message: null }
}
