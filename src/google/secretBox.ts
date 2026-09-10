/**
 * What a stored Google refresh token is wrapped in before it touches the database.
 *
 * A refresh token is standing access to somebody's calendar until they revoke it, which
 * makes a table of them worth stealing. Supabase encrypts its disks, and that defends
 * against a stolen disk -- not against anything that can already run a `select`: a leaked
 * service key, an injection, a backup copied somewhere careless. This is the layer that
 * makes a dump of the table a column of noise.
 *
 * AES-GCM rather than CBC: it authenticates as well as encrypts, so a ciphertext somebody
 * has altered refuses to open instead of decrypting into a different plausible token.
 *
 * In `src/` so the unit suite can reach it. The key itself is read only in `api/`, like
 * every other credential in this codebase.
 */

/** 96 bits, which is what GCM is specified around. */
const NONCE_BYTES = 12

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))

/**
 * Returns the bytes in a plain `ArrayBuffer`, not whatever `Uint8Array.from` infers.
 *
 * WebCrypto's `BufferSource` will not accept a `Uint8Array<ArrayBufferLike>`, because that
 * could be backed by a `SharedArrayBuffer` -- which cannot be handed to a crypto call.
 * Allocating the buffer explicitly makes the type honest instead of casting the complaint
 * away.
 */
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

/**
 * Throws on a malformed key rather than returning null.
 *
 * A wrong key at seal time is a deployment that is misconfigured, and it must fail where
 * somebody will see it -- storing something nothing can ever open again would be a silent,
 * permanent data loss discovered weeks later.
 */
async function keyFrom(base64Key: string, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(base64Key), { name: 'AES-GCM' }, false, [usage])
}

export async function seal(secret: string, base64Key: string): Promise<string> {
  const key = await keyFrom(base64Key, 'encrypt')
  // Fresh every time. A reused nonce under one key is the failure that breaks GCM outright,
  // and it would also make two students with the same token visibly identical in the column.
  const nonce = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(NONCE_BYTES)))

  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    encoder.encode(secret),
  )

  // The nonce is not a secret and travels beside the ciphertext, which is what lets the key
  // be rotated without also having to store one per row.
  const joined = new Uint8Array(new ArrayBuffer(nonce.length + sealed.byteLength))
  joined.set(nonce, 0)
  joined.set(new Uint8Array(sealed), nonce.length)

  return toBase64(joined)
}

/**
 * Null for every failure -- a wrong key, an altered ciphertext, something that was never a
 * ciphertext. The caller treats all three the same way: the connection cannot be used, and
 * the student is asked to connect again. Telling them apart would describe the defence to
 * whoever is probing it.
 */
export async function unseal(stored: string, base64Key: string): Promise<string | null> {
  try {
    const bytes = fromBase64(stored)
    if (bytes.length <= NONCE_BYTES) return null

    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, NONCE_BYTES) },
      await keyFrom(base64Key, 'decrypt'),
      bytes.slice(NONCE_BYTES),
    )

    return decoder.decode(opened)
  } catch {
    return null
  }
}
