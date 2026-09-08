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

  await expect(page).toHaveTitle('Codenection')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Codenection')
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

// An unknown path serves the app shell rather than a 404, which is what a single-page
// app needs: §11 requires a PWA installable to a home screen, and a deep link opened
// from the installed icon has to reach the router rather than a dead end. The earlier
// version of this file asserted the opposite, because it was written against a
// hand-rolled static server that no longer exists.
test('an unknown path still serves the app shell, for client-side routing', async ({ page }) => {
  await openApp(page, '/some/deep/link')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Codenection')
})
