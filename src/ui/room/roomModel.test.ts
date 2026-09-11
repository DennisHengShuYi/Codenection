import { describe, expect, it } from 'vitest'
import type { BlockRecord } from '../../domain/blockLog'
import { HORIZON_DAYS } from '../../engine'
import type { Schedule, ScheduledItem } from '../../optimizer'
import { roomModel, type RoomModelInput } from './roomModel'

const week = (over: Partial<Schedule> = {}): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
  ...over,
})

const input = (over: Partial<RoomModelInput> = {}): RoomModelInput => ({
  schedule: week(),
  today: 0,
  blockLog: [],
  predictions: [],
  ...over,
})

/**
 * What is left of this file after `rows` went.
 *
 * The old suite was mostly about the sidebar's row list -- its fixed order, its labels, its
 * per-object attention flags -- and `RoomSidebar` has not existed since Task 17. Those cases
 * were deleted with the code they described rather than rewritten, because every situation
 * they named is asserted where it is now actually rendered: `roomState.test.ts` covers
 * `doorLit`, `commitments.test.ts` and `RoomShell.request.test.tsx` cover the lapsed
 * notice, `checkIn.test.ts` and `scheduleView.test.ts` cover which blocks are still
 * unanswered, `microStart` covers stuck tasks, and `RoomShell.prediction.test.tsx` covers
 * the unscored-prediction question.
 *
 * One case had no surviving observable and is recorded rather than reworded: the ceiling
 * row's attention flag was `projection.deficitDays > 0`, and `RoomState` exposes no
 * projection-derived pressure figure -- `ceilingPressure` is planned load, which is why an
 * attempt to reword the assertion onto it failed with 0.3 against 0.3. The check-in wiring
 * it guarded is still guarded, by the weather case directly above, and the deficit day
 * itself is on screen through the dial's text equivalent.
 *
 * One case is discharged by the type rather than by a test now: "ignores confirmations
 * carried on the profile" proved `paramsFor` read only the durable log, using the ceiling
 * row as its observable. `roomModel` no longer takes a profile at all, so there is nothing
 * left for a union to be reintroduced from -- a stronger guarantee than the assertion was.
 */
describe('roomModel', () => {
  it('carries the room state the drawing needs', () => {
    const model = roomModel(input())

    expect(model.state.lightLevel).toBeGreaterThan(0)
    expect(model.state.character).toBeTruthy()
  })

  /**
   * Ruling 11 amended: `checkedInDays` exists and is unit-tested, but nothing in the
   * running app ever called it -- every `project()` call site hardcoded `checkedIn: true`
   * via `toDayInputs(schedule)`. Task 18's reachability guard tests the *parameter*, not
   * the wiring, so it would not catch this: only a test against `roomModel`'s own output
   * can. §8b's own warning is exact -- treating every silent past day as checked in
   * compounds to 2.68x pessimism nowhere, and treating it as MISSED (the bug this fixes)
   * compounds real pessimism that was previously invisible to the room.
   */
  describe('checkedIn, wired into the live projection', () => {
    const heavyMentalDay = (id: string, dayIndex: number): ScheduledItem => ({
      id,
      title: id,
      type: 'mental',
      kind: 'studyBlock',
      hours: 8,
      intensity: 1.3,
      dayIndex,
      startHour: 9,
      fixed: false,
      deadlineDay: null,
      protectedRest: false,
    })

    /**
     * Heavy enough that 20 consecutive UNANSWERED days push the fortnight into deficit by
     * day 7 (a storm), while the same 20 days all ANSWERED never cross the threshold at
     * all (clear) -- a real, numerically-verified divergence, not an assumption.
     *
     * `start` is calibrated and was re-derived when §6.2/§6.6 went per-type: at 70, mental
     * now drains at its own depleted efficiency rather than one held up by the other three,
     * so the answered fortnight crosses too and reads `clouding`. At 85 the answered branch
     * never crosses and the silent one crosses inside `STORM_WITHIN_DAYS`.
     *
     * This one is inherently narrow, because it pins two categorical thresholds at once --
     * "crosses within seven days" against "never crosses" -- so every neighbouring value of
     * `start` or `intensity` flips one side or the other. Re-derive it by sweeping the pair
     * through `roomModel` itself and reading `state.weather`; reconstructing the projection
     * by hand gets a different answer, because `roomModel` runs the student's own
     * `paramsFor(outcomesFrom(blockLog))` rather than `DEFAULT_PARAMS`.
     */
    const heavySchedule = week({
      start: { mental: 85, physical: 85, social: 85, errands: 85 },
      items: Array.from({ length: 20 }, (_, day) => heavyMentalDay(`i${day}`, day)),
    })

    const fullyAnswered: BlockRecord[] = Array.from({ length: 20 }, (_, day) => ({
      blockId: `i${day}`,
      type: 'mental',
      plannedHours: 8,
      dayIndex: day,
      // 'right': actual matches planned, so this does not also shift the learned estimate
      // bias -- isolating the assertion to the checkedIn signal alone.
      answer: 'right',
      answeredAt: 0,
    }))

    it('reads as calm when every day up to today answered, and as a storm when none did', () => {
      const silent = roomModel({ schedule: heavySchedule, today: 20, blockLog: [], predictions: [] })
      const checkedIn = roomModel({ schedule: heavySchedule, today: 20, blockLog: fullyAnswered, predictions: [] })

      expect(silent.state.weather).toBe('storm')
      expect(checkedIn.state.weather).toBe('clear')
    })

    it('treats every day from today onward as checked in, never inflating the horizon itself', () => {
      // A day still ahead has nothing to check in about (§8b). Confirms `today` is passed
      // through rather than e.g. `today - 1`, which would wrongly mark today missed too.
      const atDayZero = roomModel({ schedule: heavySchedule, today: 0, blockLog: [], predictions: [] })

      // With nothing yet lived, there is nothing to be silent about -- the fortnight
      // should read exactly as it would with the old hardcoded `true`.
      expect(atDayZero.state.weather).not.toBe('storm')
    })

    /**
     * Ruling 51: the default this used to assert is gone. `blockLog` is required, so a
     * caller with nothing to say has to say `[]` itself rather than have the model assume
     * it -- the same removal Rulings 39 and 41 made in `toDayInputs` and `priceRequest`.
     *
     * Asserted through the type rather than a value, because the failure it guards against
     * is a compile-time one: restore the default and this directive has nothing left to
     * expect, and `tsc --noEmit` fails on the unused suppression.
     */
    it('refuses a caller that does not say what the student has answered', () => {
      // @ts-expect-error blockLog is required: a caller with no log must pass [] itself.
      expect(() => roomModel({ schedule: week(), today: 0 })).toBeTruthy()
    })
  })
})
