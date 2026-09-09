import { expect, test, type Page } from '@playwright/test'

/**
 * Photo import in a real browser.
 *
 * No key is configured for this suite and `npm run preview` never serves /api, so what
 * these prove is the honest-refusal path: a student — or a judge — on a machine with no
 * model set up is told what happened and where to go instead, rather than meeting a dead
 * button or a stack trace. That is the state the demo laptop is actually in.
 *
 * The successful reading cannot be driven here without a live model and a real cost per
 * run. That gap is stated in the pull request rather than papered over.
 */
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08])

async function openPhoto(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
  await page.getByTestId('open-photo').click()
}

async function choosePhoto(page: Page) {
  await page.getByTestId('photo-input').setInputFiles({
    name: 'brief.jpg',
    mimeType: 'image/jpeg',
    buffer: JPEG_HEADER,
  })
}

test('says what happened when reading a photo is not available', async ({ page }) => {
  await openPhoto(page)
  await choosePhoto(page)

  await expect(page.getByTestId('photo-problem')).toContainText(/type it out/i)
})

// How a student tells a blurry shot from a missing key.
test('shows the photo even when the reading failed', async ({ page }) => {
  await openPhoto(page)
  await choosePhoto(page)

  await expect(page.getByTestId('photo-preview')).toBeVisible()
})

// §0 and §10 make all four widths a standing requirement, and an image in a flexible
// layout is the likeliest thing after the room to break it.
for (const width of [320, 390, 768, 1280]) {
  test(`photo import fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openPhoto(page)
    await choosePhoto(page)

    await expect(page.getByTestId('photo-preview')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}
