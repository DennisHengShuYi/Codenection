/**
 * §11 requires the app to be installable to a real phone.
 *
 * Guarded three ways, and each guard earns its place. It is skipped outside production,
 * because a worker caching assets during a test run makes failures depend on what a
 * previous run happened to cache. It checks for support rather than assuming it. And a
 * rejected registration is swallowed: an app that cannot be installed still works, while
 * an app that throws while booting does not.
 */
export async function registerServiceWorker(
  nav: Navigator = navigator,
  mode: string = import.meta.env.MODE,
): Promise<boolean> {
  if (mode !== 'production') return false
  if (!('serviceWorker' in nav)) return false

  try {
    await nav.serviceWorker.register('/sw.js', { scope: '/' })
    return true
  } catch {
    return false
  }
}
