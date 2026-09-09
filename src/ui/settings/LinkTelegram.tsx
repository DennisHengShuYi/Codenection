import { useEffect, useState } from 'react'
import { hasTelegramLink, requestLinkCode, unlinkTelegram } from '../../data'

type Offer = { code: string; url: string }

/**
 * Linking a Telegram chat to this account (§13.5).
 *
 * Shown only to a signed-in student — a chat is linked to an account, and there is no
 * account to link to otherwise.
 */
export function LinkTelegram() {
  const [linked, setLinked] = useState<boolean | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    void hasTelegramLink().then((found) => {
      if (!cancelled) setLinked(found)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function onLink() {
    if (busy) return

    setBusy(true)
    setError(null)

    const result = await requestLinkCode()

    // Two codes in flight would leave the student holding one the database has already
    // replaced, since issuing a code clears the last.
    if (result.ok) setOffer({ code: result.code, url: result.url })
    else setError(result.message)

    setBusy(false)
  }

  async function onUnlink() {
    if (busy) return

    setBusy(true)
    setError(null)

    const result = await unlinkTelegram()

    if (result.ok) {
      setLinked(false)
      setOffer(null)
    } else {
      setError(result.message ?? 'Could not unlink.')
    }

    setBusy(false)
  }

  // Nothing until we know which state to show. Flashing "not linked" at somebody whose chat
  // is linked reads as the link having been lost.
  if (linked === null) return null

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 text-sm">
      <h2 className="font-medium">Telegram</h2>

      {linked ? (
        <>
          <p className="opacity-70">
            Linked. Send the bot a message and it will turn it into a week.
          </p>
          <button
            type="button"
            onClick={() => void onUnlink()}
            disabled={busy}
            className="self-start underline disabled:opacity-60"
          >
            Unlink Telegram
          </button>
        </>
      ) : (
        <>
          <p className="opacity-70">
            Add to your week by messaging a bot, without opening the app.
          </p>

          {offer === null ? (
            <button
              type="button"
              onClick={() => void onLink()}
              disabled={busy}
              className="self-start rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-60"
            >
              Link Telegram
            </button>
          ) : (
            <>
              {/* The link is the path anybody on a phone should take. The code is shown as
                  well for the case where the app and Telegram are on different devices. */}
              <a
                href={offer.url}
                target="_blank"
                rel="noreferrer"
                className="self-start rounded-lg bg-slate-900 px-3 py-2 text-white"
              >
                Open Telegram
              </a>
              <p className="opacity-70">
                Or send the bot this code: <strong>{offer.code}</strong>
              </p>
              <p className="opacity-70">It stops working after ten minutes.</p>
            </>
          )}
        </>
      )}

      {/* role=alert so assistive technology is told what went wrong, matching every other
          failure in the app. */}
      {error !== null && (
        <p role="alert" className="text-rose-700">
          {error}
        </p>
      )}
    </section>
  )
}
