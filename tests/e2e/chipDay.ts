import type { Page } from '@playwright/test'

/**
 * Answer the day on every chip on screen.
 *
 * Ruling 43: the week will not take an item that does not say when it happens, so this is
 * the press a student makes before Add -- five specs were each doing it with their own loop.
 *
 * A date rather than an option, because the chip picks its day on a calendar now. The
 * `<select>` of twenty-one days it used to render survives only where a week has no
 * `startedOn`, and every one of these specs enters through a `RoomShell` that anchors the
 * week it loads -- so in a real browser the control is always the date input.
 *
 * The day is read off the picker's own `min`, which `DayPicker` sets to day zero of the
 * fortnight. Hard-coding a date would tie these specs to the day they were written, and
 * they run on whatever day CI happens to be having.
 */
export async function answerEveryChipDay(page: Page, daysIn = 2): Promise<void> {
  for (const picker of await page.getByTestId(/^when-day-/).all()) {
    const firstDay = await picker.getAttribute('min')
    if (firstDay === null) {
      // No `min` means the fallback list, which is a select and takes an index.
      await picker.selectOption(String(daysIn))
      continue
    }

    const day = new Date(`${firstDay}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + daysIn)

    await picker.fill(day.toISOString().slice(0, 10))
  }
}
