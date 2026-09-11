import { expect, test, type Page } from '@playwright/test'

/**
 * The room in a real browser.
 *
 * No credentials are configured for this suite, so there is no account to sign into and
 * every test enters the way a judge would.
 */
async function openApp(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /look around/i }).click()
}

/**
 * §0 and §10 make all four widths a standing requirement. The room is the likeliest
 * thing in the app to break it, being a fixed-proportion drawing on a screen that is not.
 */
for (const width of [320, 390, 768, 1280]) {
  test(`the room fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openApp(page)

    await expect(page.getByTestId('room-scene')).toBeVisible()

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )

    expect(overflows, `horizontal overflow at ${width}px`).toBe(false)
  })
}

/**
 * Ruling 52, measured rather than inferred.
 *
 * The corner gauge was in the DOM with the right number and painted behind the room's own
 * wall rect, because the scene `<svg>` is a later absolutely positioned sibling with no
 * z-index between them. Five unit tests passed on it, all asserting presence or text.
 *
 * A real browser can answer the question those could not: hit-test the middle of the
 * gauge and ask what is actually on top there. On the shipped DOM order the answer is
 * something inside the scene; it has to be the gauge.
 */
test('shows the corner gauge on top of the room, not behind its wall', async ({ page }) => {
  await openApp(page)

  const gauge = page.getByTestId('room-gauge')
  await expect(gauge).toBeVisible()

  const box = await gauge.boundingBox()
  expect(box, 'the gauge has no box to hit-test').not.toBeNull()

  const topmost = await page.evaluate(
    ([x, y]) => {
      const hit = document.elementFromPoint(x as number, y as number)
      return hit === null ? null : (hit.closest('[data-testid]')?.getAttribute('data-testid') ?? hit.tagName)
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
  )

  expect(topmost).toBe('room-gauge')
})

// §1.5: the picture carries nothing to a screen reader, so the words have to be there.
// Ruling 61 moved them behind the `Waiting` button, which is where they are read from now.
test('states the room in words as well as drawing it', async ({ page }) => {
  await openApp(page)

  await page.getByTestId('open-notices').click()

  await expect(page.getByTestId('room-text-equivalent')).not.toHaveText('')
})

/**
 * The inverse of the test this replaces.
 *
 * `opens an object when it is tapped` drove `object-plant` into a `zoom-plant` layer. §3
 * deleted both: the room is a picture of the week, and every feature it used to hide behind
 * a tap now has a button of its own (`The week`, `Add something`, `Settings`) or a card on
 * the screen. So the old assertion is not merely stale, it asserts the opposite of the
 * design -- and it is worth one test that the tap targets stay gone, because "make the
 * furniture clickable again" is exactly the kind of change that reads as an improvement.
 */
test('draws the room without turning any of it back into a control', async ({ page }) => {
  await openApp(page)

  const scene = page.getByTestId('room-scene')
  await expect(scene).toBeVisible()

  // A CSS locator rather than getByRole: the scene declares role="img", which hides its
  // whole subtree from the accessibility tree, so an aria query inside it would report
  // zero controls whether or not any existed -- a guard that cannot fail.
  await expect(scene.locator('button, a, [role="button"], [role="link"]')).toHaveCount(0)

  // And the behavioural half, the exact inverse of the deleted assertion: `opens an object
  // when it is tapped` drove a piece of furniture, and tapping one now opens nothing.
  //
  // The bed rather than the plant, which §45 retired along with the reserve it read. A
  // permanent object on purpose -- the objects today puts in the room come and go with the
  // day, so a test that tapped one would pass or fail on what the seed happened to contain.
  await scene.getByTestId('room-bed').click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByTestId('sheet')).toHaveCount(0)
})

/**
 * Rulings 54 and 55, measured in the only place they can be.
 *
 * The room now fills the screen, `Settings`, `The week` and `+` sit inside it, and the
 * paragraph, the accuracy line and the live cards ride in a band over the lower room.
 * Overlaid controls have failed here before -- PR #39's band "covered the furniture and
 * swallowed its clicks -- the phone was unreachable from 768px up". The click-swallowing
 * half cannot recur (the drawing is display-only now: nothing inside it wants a click), so
 * what is left to prove is the visual half, and one thing PR #39 did not have a name for:
 * **the character has to stay legible**, because §1.3's character is how this app says how
 * the student is doing and nothing else expresses it.
 *
 * Every assertion here is a measurement of the rendered page, not of the DOM: a unit test
 * can say the band contains the paragraph, and would say exactly the same thing about a
 * band painted over the character's face.
 */
const controlAt = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const hit = document.elementFromPoint(px as number, py as number)
      return hit === null ? null : (hit.closest('[data-testid]')?.getAttribute('data-testid') ?? hit.tagName)
    },
    [x, y],
  )

/**
 * The four required widths, each with a height a screen of that width actually has. The
 * height is not decoration here: the band is capped against the character's position, which
 * is `min(52.33vw, 60.38% of the stage)` down the screen, so which of the two terms wins changes with
 * the shape of the viewport. 320x568 is the small phone the band has least room on and the
 * one a flat percentage cap got wrong.
 */
const VIEWPORTS: readonly (readonly [number, number])[] = [
  [320, 568],
  [390, 844],
  [768, 800],
  [1280, 800],
]

for (const [width, height] of VIEWPORTS) {
  test(`the room screen keeps its controls hittable and its character clear at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openApp(page)

    const stage = await page.getByTestId('room-stage').boundingBox()
    const scene = await page.getByTestId('room-scene').boundingBox()
    const character = await page.getByTestId('room-character').boundingBox()
    expect(stage && scene && character, 'a measured element has no box').toBeTruthy()

    // The room fills the screen: the drawing spans the stage, and the stage spans the
    // viewport. Not "is visible" -- the aspect-boxed room it replaces was visible too.
    expect(stage!.height, `the stage does not fill the viewport at ${width}px`).toBeGreaterThanOrEqual(
      height - 10,
    )
    expect(scene!.height).toBeGreaterThanOrEqual(stage!.height - 1)

    // Ruling 61 emptied the band -- the words, the accuracy line and the cards wait behind
    // the `Waiting` button -- so nothing is painted over the lower room at all.
    await expect(page.getByTestId('room-band')).toHaveCount(0)

    // Ruling 55's binding constraint, which outlived the band that made it necessary: the
    // whole character -- head, face, posture, feet on the floor line -- is what says how the
    // student is doing, and nothing may be painted over it. Asked of the browser rather than
    // of arithmetic: what is actually at the character's face?
    const face = await controlAt(page, character!.x + character!.width / 2, character!.y + character!.height * 0.2)
    expect(face).toBe('room-character')

    // §1.5's fold rule, which is why the controls were outside the room in the first place:
    // nothing the student needs may require a scroll.
    const scrolls = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    )
    expect(scrolls, `the room screen scrolls at ${width}px`).toBe(false)

    // All four controls and the gauge, hit-tested where a thumb would land. `toBeVisible`
    // passes on a button painted under something else; `elementFromPoint` does not -- and
    // this is the check that caught `Waiting` widening the row until its own box reached
    // across the gauge and swallowed the press meant for it.
    for (const id of ['open-settings', 'open-week', 'open-notices', 'open-add', 'room-gauge']) {
      const control = page.getByTestId(id)
      await expect(control).toBeVisible()

      const box = await control.boundingBox()
      expect(box, `${id} has no box at ${width}px`).not.toBeNull()
      expect(box!.height, `${id} is under the 44px touch target at ${width}px`).toBeGreaterThanOrEqual(44)

      const topmost = await controlAt(page, box!.x + box!.width / 2, box!.y + box!.height / 2)
      expect(topmost, `${id} is covered at ${width}px`).toBe(id)
    }
  })
}

/**
 * "The room fills the screen" has to survive a screen that is not the drawing's shape.
 *
 * A 3:2 room in a 16:10 window letterboxes: `preserveAspectRatio` leaves a band down each
 * side. The room reaches into those bands because the wall, the ceiling and the floor are
 * drawn far past the viewBox and an `<svg>` clips to its element box rather than to its
 * viewBox -- so the room continues rather than the drawing sitting in a rectangle of
 * background colour. 1280x800 is wide enough for the drawing to be limited by height, which
 * is what produces the side bands; a point ten pixels from the left edge lands in one.
 */
test('reaches the edges of a screen the drawing does not fit, with room rather than backdrop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openApp(page)

  const scene = await page.getByTestId('room-scene').boundingBox()
  expect(scene!.width).toBe(1280)

  const nearTop = await controlAt(page, 10, 200)
  const nearFloor = await controlAt(page, 10, 470)

  expect(nearTop, 'the left edge at wall height is not wall').toBe('room-wall')
  expect(nearFloor, 'the left edge at floor height is not floor').toBe('room-floor')
})

/**
 * The band earns its place only if it actually carries the things §3 put beneath the
 * drawing. Asserted at 390px with them on screen at once, and clicked through, so this
 * cannot pass on a band that renders them somewhere unreachable.
 */
test('carries the words, the accuracy line and the live cards behind the Waiting button, and still opens the week', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await openApp(page)

  await page.getByTestId('open-notices').click()
  const waiting = page.getByRole('dialog', { name: /waiting/i })
  await expect(waiting.getByTestId('room-text-equivalent')).not.toHaveText('')
  await expect(waiting.getByTestId('accuracy-note')).toBeVisible()

  await page.getByRole('button', { name: /close/i }).click()
  await expect(waiting).toHaveCount(0)

  // And the row is a place a student can act from, not just read: the week opens from it.
  // Since Ruling 59 the week is a sheet OVER the room rather than a page replacing it, so
  // what proves the click landed is the dialog, and the room stays where it was -- inert
  // behind the panel until the sheet closes.
  await page.getByTestId('open-week').click()
  await expect(page.getByRole('dialog', { name: /the week/i })).toBeVisible()
  await expect(page.getByTestId('room-stage')).toHaveAttribute('inert', '')
})

/**
 * §46: the panel, in the two places it lives.
 *
 * jsdom has no viewport, so which of the two is actually VISIBLE at a given width is a
 * question only a browser can answer -- and it is the whole design: a panel that appeared
 * over the room on a phone would cover the character, which Ruling 55 forbids.
 */
test('floats the today panel beside the room on a laptop, and keeps it clear of the character', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await openApp(page)

  const panel = page.getByTestId('today-panel-floating')
  await expect(panel).toBeVisible()
  // The button is the phone's way in and has nothing to do here, where the panel is already
  // on screen.
  await expect(page.getByTestId('open-today')).toBeHidden()

  const panelBox = await panel.boundingBox()
  const character = await page.getByTestId('room-character').boundingBox()
  expect(panelBox && character, 'a measured element has no box').toBeTruthy()

  // Ruling 55: nothing may be painted over the character. The panel is to the right of it.
  expect(
    panelBox!.x,
    'the today panel reaches across the character',
  ).toBeGreaterThanOrEqual(character!.x + character!.width)
})

test('opens the today panel from the control row on a phone, where there is no beside', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openApp(page)

  await expect(page.getByTestId('today-panel-floating')).toBeHidden()

  await page.getByTestId('open-today').click()

  // Scoped to the sheet: the floating panel is still in the document at this width, hidden
  // by CSS rather than unmounted -- `display: none` keeps it out of the accessibility tree,
  // so a screen reader is not offered the same rows twice.
  const sheet = page.getByRole('dialog', { name: /today/i })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('panel-row-books')).toBeVisible()
})

/**
 * The controls belong INSIDE the ceiling, not on the wall below it.
 *
 * `Ceiling` draws `10 + pressure * 34` viewBox units, which at 390px is between 13 and 57
 * real pixels while the control row needs 56 -- so on a light day the buttons hung off the
 * ceiling and floated on the wall. The bar carries the ceiling's own colour for that reason,
 * and this is the check that every control actually sits within it at every width, including
 * the ones where the row wraps.
 */
for (const [width, height] of VIEWPORTS) {
  test(`keeps every control inside the ceiling band at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openApp(page)

    const bar = await page.getByTestId('room-bar').boundingBox()
    expect(bar, 'the bar has no box').not.toBeNull()

    for (const id of ['open-settings', 'open-week', 'open-add', 'room-gauge']) {
      const box = await page.getByTestId(id).boundingBox()
      expect(box, `${id} has no box at ${width}px`).not.toBeNull()

      expect(box!.y, `${id} starts above the bar at ${width}px`).toBeGreaterThanOrEqual(bar!.y - 1)
      expect(
        box!.y + box!.height,
        `${id} hangs below the ceiling onto the wall at ${width}px`,
      ).toBeLessThanOrEqual(bar!.y + bar!.height + 1)
    }
  })
}

/**
 * The panel starts below the brown at the top of the room.
 *
 * Neither piece of brown is a fixed number of pixels: `Ceiling` is drawn in viewBox units,
 * so it scales with the stage, and the control bar sizes itself to however many rows of
 * controls it is holding. The panel's offset is a percentage for that reason -- and it was
 * wrong on the first attempt, overlapping by 25px at 2560px, because the ceiling hangs
 * blocks BELOW its own depth. Measured at the widths where the two diverge most.
 */
for (const [width, height] of [
  [2560, 1440],
  [1920, 1080],
  [1200, 800],
  [768, 800],
] as const) {
  test(`keeps the today panel clear of the ceiling at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await openApp(page)

    const ceiling = await page.getByTestId('room-ceiling').boundingBox()
    const bar = await page.getByTestId('room-bar').boundingBox()
    const panel = await page.getByTestId('today-panel-floating').boundingBox()
    expect(ceiling && bar && panel, 'a measured element has no box').toBeTruthy()

    const brownEnds = Math.max(ceiling!.y + ceiling!.height, bar!.y + bar!.height)

    expect(
      panel!.y,
      `the today panel overlaps the brown at ${width}x${height}`,
    ).toBeGreaterThanOrEqual(brownEnds)
  })
}
