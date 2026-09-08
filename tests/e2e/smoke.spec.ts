import { expect, test } from '@playwright/test'

// The floor of the browser gate: the built bundle loads and the page renders. Kept
// separate from engine.spec.ts deliberately -- when the model changes shape those tests
// move with it, and this one should still be here proving the app boots at all.
test('the page renders', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Codenection')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Codenection')
})

// An unknown path serves the app shell rather than a 404, which is what a single-page
// app needs: §11 requires a PWA installable to a home screen, and a deep link opened
// from the installed icon has to reach the router rather than a dead end. The earlier
// version of this file asserted the opposite, because it was written against a
// hand-rolled static server that no longer exists.
test('an unknown path still serves the app shell, for client-side routing', async ({ page }) => {
  await page.goto('/some/deep/link')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Codenection')
})
