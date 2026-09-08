import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrubAuthFragmentFromUrl } from './scrubAuthFragment'

/** Puts the browser at an address without leaving a trail, so each test starts clean. */
const at = (url: string) => window.history.replaceState(null, '', url)

beforeEach(() => {
  at('/')
})

describe('scrubAuthFragmentFromUrl', () => {
  // Google hands the session back in the fragment. Supabase reads it and is supposed to
  // clear it, but that cleanup can lag a paint behind -- long enough to be caught in a
  // screen share or left in the address bar.
  it('removes a session token from the address', () => {
    at('/#access_token=secret-value&expires_in=3600')

    scrubAuthFragmentFromUrl()

    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain('secret-value')
  })

  // A student who opened a deep link and then signed in has to stay on that page, not be
  // quietly moved to the root.
  it('keeps the path and the query either side of it', () => {
    at('/some/deep/link?invited=yes#access_token=secret-value')

    scrubAuthFragmentFromUrl()

    expect(window.location.pathname).toBe('/some/deep/link')
    expect(window.location.search).toBe('?invited=yes')
    expect(window.location.hash).toBe('')
  })

  it('leaves an address with no fragment exactly as it is', () => {
    at('/settings?tab=week')

    expect(() => scrubAuthFragmentFromUrl()).not.toThrow()

    expect(window.location.pathname).toBe('/settings')
    expect(window.location.search).toBe('?tab=week')
  })

  // An in-page link is somebody's actual navigation, not a token to be tidied away.
  it('leaves a fragment that is not an auth token alone', () => {
    at('/#recovery-blocks')

    scrubAuthFragmentFromUrl()

    expect(window.location.hash).toBe('#recovery-blocks')
  })

  /**
   * Replaced rather than pushed. A new history entry would mean pressing back returns to
   * an address still carrying the token, which defeats the point of removing it.
   */
  it('does not add a history entry', () => {
    at('/#access_token=secret-value')
    const replace = vi.spyOn(window.history, 'replaceState')
    const push = vi.spyOn(window.history, 'pushState')

    scrubAuthFragmentFromUrl()

    expect(replace).toHaveBeenCalledOnce()
    expect(push).not.toHaveBeenCalled()
    replace.mockRestore()
    push.mockRestore()
  })

  it('does nothing at all when there is no token, rather than replacing needlessly', () => {
    at('/#recovery-blocks')
    const replace = vi.spyOn(window.history, 'replaceState')

    scrubAuthFragmentFromUrl()

    expect(replace).not.toHaveBeenCalled()
    replace.mockRestore()
  })
})
