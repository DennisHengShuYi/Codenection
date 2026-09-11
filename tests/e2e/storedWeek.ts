import { expect, type Page } from '@playwright/test'

/**
 * Wait for an edit to actually land in the browser's own database before reloading.
 *
 * `useSchedule.setSchedule` fires `saveWeek` and does not await it -- deliberately, so a slow
 * write cannot block the screen the student is looking at. That leaves a real race against a
 * reload in the very next instant, and reloading blind makes a persistence test flaky: it
 * passes alone and fails in the full suite, where the browser has other work in hand.
 *
 * Polling the store the app actually writes to says exactly what is being waited for, rather
 * than hiding the race behind a sleep. The race itself is pre-existing and applies to every
 * edit path, which is why this lives here rather than in one spec: every test that reloads to
 * prove something persisted has the same problem.
 */
export async function expectWeekStored(page: Page, contains: string) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve) => {
              const request = indexedDB.open('codenection')
              request.onerror = () => resolve('')
              request.onsuccess = () => {
                const db = request.result
                if (!db.objectStoreNames.contains('state')) return resolve('')
                const read = db.transaction('state', 'readonly').objectStore('state').get('week')
                read.onerror = () => resolve('')
                read.onsuccess = () => resolve(JSON.stringify(read.result ?? ''))
              }
            }),
        ),
      { timeout: 10_000 },
    )
    .toContain(contains)
}
