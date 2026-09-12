import { expect, test, type Page } from '@playwright/test'

/**
 * Every browser test enters the way a judge would: no credentials are configured for
 * this suite, so there is no account to sign into, and the signed-out preview is the
 * only door.
 */
async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await page.getByRole('button', { name: /look around/i }).click()
}

// The floor of the browser gate: the built bundle loads and the page renders. Kept
// separate from engine.spec.ts deliberately -- when the model changes shape those tests
// move with it, and this one should still be here proving the app boots at all.
test('the page renders', async ({ page }) => {
  await openApp(page)

  await expect(page).toHaveTitle('Loadline')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loadline')
})

// A declared icon that resolves. Without a rel="icon" link the browser falls back to
// probing /favicon.ico, which this app does not serve -- a 404 on every page load, and
// noise in the console that buries real errors. Asserted by declaration and by fetching
// the href rather than by watching for a 404, because headless Chromium does not reliably
// request a favicon at all, so a 404 watcher would pass whether or not the link existed.
test('the page declares an icon that actually exists', async ({ page, request }) => {
  await page.goto('/')

  const href = await page.locator('link[rel~="icon"]').first().getAttribute('href')
  expect(href).toBeTruthy()

  const icon = await request.get(href as string)
  expect(icon.status()).toBe(200)
})

/**
 * The sign-in screen in the state this suite, CI, and the demo all build: no Supabase.
 *
 * The approved test plan asked the opposite of this -- that the Google button be visible
 * at 390px. That is not testable here, and deliberately so: playwright.config.ts blanks
 * VITE_SUPABASE_URL so the build cannot be pointed at a real project, because the
 * rebalance test writes and .claude/CLAUDE.md forbids a test touching production data.
 * Weakening that guard to see a button is the wrong trade, so this asserts the rule the
 * button actually follows instead -- no door that cannot open -- in the real bundle.
 */
test('offers no Google button in a build with no backend to sign in with', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0)

  // The two doors that must still be there, at the width the app is built for.
  await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /look around/i })).toBeVisible()
})

// An unknown path serves the app shell rather than a 404, which is what a single-page
// app needs: §11 requires a PWA installable to a home screen, and a deep link opened
// from the installed icon has to reach the router rather than a dead end. The earlier
// version of this file asserted the opposite, because it was written against a
// hand-rolled static server that no longer exists.
test('an unknown path still serves the app shell, for client-side routing', async ({ page }) => {
  await openApp(page, '/some/deep/link')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loadline')
})

/**
 * The Telegram panel belongs to an account, and this suite has none.
 *
 * §13.4 forbids the bot acting for a chat it cannot resolve to an account, and the panel is
 * the only way to make that link -- so offering it to a visitor with nothing to link to
 * would be a door that cannot open, the same rule the Google button follows.
 *
 * The linked and unlinked states cannot be reached here: the build blanks Supabase so the
 * suite cannot touch a real project, so those are covered at component level instead.
 */
test('offers no Telegram linking to a visitor with no account', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)

  await expect(page.getByRole('button', { name: /link telegram/i })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Loadline')
})
