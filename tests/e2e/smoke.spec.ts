import { expect, test } from '@playwright/test'

// A real assertion against a real rendered page, not a placeholder that passes
// vacuously: it boots the server, loads the document, and fails if the page does not
// render. Replace these with the app's own tests as it grows -- but keep at least one
// test that proves the browser job can still catch a broken page.
test('the page renders', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Codenection')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Codenection')
  await expect(page.getByTestId('status')).toHaveText('Ready')
})

test('an unknown path returns 404 rather than the page', async ({ page }) => {
  const response = await page.goto('/does-not-exist')

  expect(response?.status()).toBe(404)
})
