import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerServiceWorker'

const navigatorWith = (register: () => Promise<unknown>): Navigator =>
  ({ serviceWorker: { register } }) as unknown as Navigator

describe('registerServiceWorker', () => {
  it('registers in a browser that supports it', async () => {
    const register = vi.fn().mockResolvedValue({})

    expect(await registerServiceWorker(navigatorWith(register), 'production')).toBe(true)
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })

  // A worker caching assets mid-test makes failures depend on what a previous run
  // happened to cache, which is the worst kind of flake to chase.
  it('does nothing during development or tests', async () => {
    const register = vi.fn()

    expect(await registerServiceWorker(navigatorWith(register), 'development')).toBe(false)
    expect(register).not.toHaveBeenCalled()
  })

  it('does nothing where service workers are unsupported', async () => {
    expect(await registerServiceWorker({} as Navigator, 'production')).toBe(false)
  })

  // An app that cannot be installed still works; an app that throws while booting does
  // not. A failed registration must never take the page down with it.
  it('survives a registration that rejects', async () => {
    const register = vi.fn().mockRejectedValue(new Error('nope'))

    await expect(registerServiceWorker(navigatorWith(register), 'production')).resolves.toBe(
      false,
    )
  })
})
