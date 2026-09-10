import { describe, expect, it } from 'vitest'
import { seal, unseal } from './secretBox'

// 32 bytes, base64. Any real key comes from GOOGLE_TOKEN_KEY and never appears in source.
const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
const OTHER_KEY = 'ZmVkY2JhOTg3NjU0MzIxMGZlZGNiYTk4NzY1NDMyMTA='

/**
 * What a stored Google refresh token is wrapped in.
 *
 * A refresh token is standing access to somebody's calendar for as long as they do not
 * revoke it, which makes a table of them worth stealing. Supabase encrypts its disks, but
 * that protects against a stolen disk and not against anything that can already run a
 * `select` -- a leaked service key, an injection, a backup copied somewhere careless. This
 * is the layer that means a dump of the table is a column of noise.
 *
 * AES-GCM rather than AES-CBC: it authenticates as well as encrypts, so a modified
 * ciphertext fails to open rather than decrypting into something unpredictable.
 */
describe('seal and unseal', () => {
  it('gives back exactly what was put in', async () => {
    const sealed = await seal('1//refresh-token-value', KEY)

    expect(await unseal(sealed, KEY)).toBe('1//refresh-token-value')
  })

  it('does not leave the secret readable in what it stores', async () => {
    const sealed = await seal('1//refresh-token-value', KEY)

    expect(sealed).not.toContain('refresh-token-value')
  })

  /** The point of the exercise: the table alone is not enough. */
  it('cannot be opened with the wrong key', async () => {
    const sealed = await seal('1//refresh-token-value', KEY)

    expect(await unseal(sealed, OTHER_KEY)).toBeNull()
  })

  /**
   * Authenticated encryption, and the reason for choosing GCM. A ciphertext somebody has
   * altered must refuse to open rather than producing a different plausible token.
   */
  it('refuses a ciphertext that has been altered', async () => {
    const sealed = await seal('1//refresh-token-value', KEY)
    const flipped = `${sealed.slice(0, -4)}AAAA`

    expect(await unseal(flipped, KEY)).toBeNull()
  })

  /** Two seals of the same secret must differ, or the column shows which students share a
   *  value and how often one changes. */
  it('produces a different ciphertext every time', async () => {
    expect(await seal('same-token', KEY)).not.toBe(await seal('same-token', KEY))
  })

  it.each([
    ['empty', ''],
    ['not base64', '!!!not-base64!!!'],
    ['too short to hold a nonce', 'AAAA'],
  ])('refuses stored data that is %s', async (_name, stored) => {
    expect(await unseal(stored, KEY)).toBeNull()
  })

  /** A key that is not a key must fail loudly at the point of use rather than silently
   *  storing something unopenable. */
  it('refuses to seal with a malformed key', async () => {
    await expect(seal('token', 'not-a-real-key')).rejects.toThrow()
  })

  it('handles a token with characters that survive no naive encoding', async () => {
    const awkward = '1//0e-Ünïcödé_token+with/slashes=='

    expect(await unseal(await seal(awkward, KEY), KEY)).toBe(awkward)
  })
})
