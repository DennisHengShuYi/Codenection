import { describe, expect, it } from 'vitest'
import { ENOUGH_SLEEP_HOURS } from '../engine'
import type { EnergyPrediction } from './predictions'
import { recordNight, type SleepNight } from './sleepLog'
import { enoughSleepFor, sleepEnoughLine } from './sleepEnough'

const date = (day: number): string => `2026-09-${String(day).padStart(2, '0')}`

const night = (day: number, hours: number): SleepNight => ({
  isoDate: date(day),
  hours,
  answeredAt: day,
})

/** A resolved claim: what was predicted, and what the student said afterwards. */
const felt = (day: number, predicted: number, reported: number | null): EnergyPrediction => ({
  forDate: date(day),
  predicted,
  reported,
})

/**
 * A fortnight where the nights above `knee` bought the student nothing.
 *
 * Below the knee the app predicts correctly (residual 0). Above it the app over-predicts by
 * `over`, because it credited sleep this student does not benefit from. That over-prediction
 * is the entire signal.
 */
const fortnight = (
  knee: number,
  over = 12,
): { nights: SleepNight[]; predictions: EnergyPrediction[] } => {
  const nights: SleepNight[] = []
  const predictions: EnergyPrediction[] = []

  for (let index = 0; index < 8; index += 1) {
    const long = index % 2 === 0
    nights.push(night(index + 1, long ? knee + 2 : knee - 1))
    predictions.push(felt(index + 1, 60, long ? 60 - over : 60))
  }

  return { nights, predictions }
}

/**
 * Learning how much sleep is enough for one student.
 *
 * Joins two streams that had never met: what was slept (`./sleepLog`, keyed by the morning a
 * night ended) and how the day went against what was claimed (`./predictions`, keyed by the
 * same date).
 *
 * Deliberately NOT a fifth entry in `recoveryLearning.LEARNED`. That learner nudges a
 * coefficient and measures how far the projection moves, and its own reasoning already
 * rejects a threshold for the reason that bites hardest here: nudging a ceiling UPWARD
 * changes nothing for a student whose nights all sit below it, so the measured sensitivity is
 * zero and the sample is discarded. It could only ever push the ceiling up, and "seven is
 * enough for me" is a correction down.
 */
describe('enoughSleepFor', () => {
  describe('pairing a night with the day it shaped', () => {
    /**
     * The case that matters most. An unresolved prediction is *no measurement*, and treating
     * it as a zero residual would pull every estimate toward "the model is exactly right",
     * which is the flattering direction. `meanAbsoluteError` refuses the same conflation.
     */
    it('says nothing from a prediction nobody has answered yet', () => {
      const { nights, predictions } = fortnight(7)
      const unanswered = predictions.map((prediction) => ({ ...prediction, reported: null }))

      expect(enoughSleepFor(nights, unanswered)).toBe(ENOUGH_SLEEP_HOURS)
    })

    it('says nothing from nights with no prediction to pair with', () => {
      expect(enoughSleepFor(fortnight(7).nights, [])).toBe(ENOUGH_SLEEP_HOURS)
    })

    it('says nothing from predictions with no night to pair with', () => {
      expect(enoughSleepFor([], fortnight(7).predictions)).toBe(ENOUGH_SLEEP_HOURS)
    })

    it('pairs a night only with the day of the morning it ended', () => {
      const { nights, predictions } = fortnight(7)
      // Every prediction moved to a date no night ended on, so nothing lines up any more.
      const shifted = predictions.map((prediction, index) => ({
        ...prediction,
        forDate: date(index + 20),
      }))

      expect(enoughSleepFor(nights, shifted)).toBe(ENOUGH_SLEEP_HOURS)
    })

    /**
     * One date carries one night. Driven through `recordNight` rather than a hand-built log,
     * because that upsert is the real enforcement path -- a log assembled around it would
     * prove nothing about it. Without the upsert the corrected date would be paired twice and
     * counted twice in its group's mean.
     */
    it('reads one night per date even when the same night was answered twice', () => {
      const { nights, predictions } = fortnight(7)
      const corrected = recordNight(nights, night(1, 7))
      const asIfOnlyEverAnsweredOnce = nights.map((entry) =>
        entry.isoDate === date(1) ? night(1, 7) : entry,
      )

      expect(corrected).toHaveLength(nights.length)
      expect(enoughSleepFor(corrected, predictions)).toBe(
        enoughSleepFor(asIfOnlyEverAnsweredOnce, predictions),
      )
    })
  })

  describe('refusing to speak', () => {
    /**
     * The student whose sleep never varies, and the case that drove the whole design. There
     * is no comparison to make, so nothing is claimed -- and it is silent by the same
     * mechanism every other unlearned parameter is, not by a special case written for this.
     */
    it('says nothing when every night is the same length', () => {
      const nights = Array.from({ length: 8 }, (_, index) => night(index + 1, 7))
      const predictions = nights.map((_, index) => felt(index + 1, 60, 50))

      expect(enoughSleepFor(nights, predictions)).toBe(ENOUGH_SLEEP_HOURS)
    })

    it('says nothing when one side is under the sample floor', () => {
      const nights = [night(1, 5), night(2, 8), night(3, 8), night(4, 8), night(5, 8)]
      const predictions = nights.map((_, index) => felt(index + 1, 60, 55))

      expect(enoughSleepFor(nights, predictions)).toBe(ENOUGH_SLEEP_HOURS)
    })

    it('says nothing at all with no evidence', () => {
      expect(enoughSleepFor([], [])).toBe(ENOUGH_SLEEP_HOURS)
    })

    /**
     * The two groups must be far enough apart to be about anything.
     *
     * A median split ALWAYS produces two groups -- even when the split is meaningless. Three
     * nights of 7.4 hours against three of 7.6 clears the sample floor on both sides and says
     * nothing whatever about how much sleep this student needs, but the residuals still
     * differ, because residuals absorb exams and arguments and colds along with sleep. Before
     * this guard that produced "about 7.9 hours is enough for you" out of twelve minutes and
     * three ordinary bad days.
     *
     * A confidently wrong number, which this project holds to be worse than no number. The
     * sample floor was never the whole bar; this is the other half of it.
     */
    it('says nothing when the two groups are barely apart', () => {
      const nights = [7.4, 7.4, 7.4, 7.6, 7.6, 7.6].map((hours, index) =>
        night(index + 1, hours),
      )
      // Noise only: the longer group happened to hold three mediocre days.
      const predictions = [60, 60, 60, 48, 48, 48].map((reported, index) =>
        felt(index + 1, 60, reported),
      )

      expect(enoughSleepFor(nights, predictions)).toBe(ENOUGH_SLEEP_HOURS)
    })

    /** The boundary, where a `>=` written as `>` would silence a student who does qualify. */
    it('speaks when the groups are exactly the separation apart', () => {
      const nights = [7, 7, 7, 8, 8, 8].map((hours, index) => night(index + 1, hours))
      const predictions = [60, 60, 60, 48, 48, 48].map((reported, index) =>
        felt(index + 1, 60, reported),
      )

      expect(enoughSleepFor(nights, predictions)).toBeLessThan(ENOUGH_SLEEP_HOURS)
    })

    it('speaks on three nights a side', () => {
      const nights = [6, 6, 6, 9, 9, 9].map((hours, index) => night(index + 1, hours))
      const predictions = [60, 60, 60, 48, 48, 48].map((reported, index) =>
        felt(index + 1, 60, reported),
      )

      expect(enoughSleepFor(nights, predictions)).toBeLessThan(ENOUGH_SLEEP_HOURS)
    })
  })

  describe('what it finds', () => {
    it('lowers the ceiling when the longer nights land worse than predicted', () => {
      const { nights, predictions } = fortnight(7)

      expect(enoughSleepFor(nights, predictions)).toBeLessThan(ENOUGH_SLEEP_HOURS)
    })

    it('raises it when the longer nights land better than predicted', () => {
      const { nights, predictions } = fortnight(7, -12)

      expect(enoughSleepFor(nights, predictions)).toBeGreaterThan(ENOUGH_SLEEP_HOURS)
    })

    /** The null case, and the one a sign error breaks: evidence that says nothing must move
     *  nothing, or the figure drifts on noise. */
    it('does not move when both groups land as predicted', () => {
      const { nights, predictions } = fortnight(7, 0)

      expect(enoughSleepFor(nights, predictions)).toBe(ENOUGH_SLEEP_HOURS)
    })

    /** The planted answer: the extra sleep above six buys nothing, so the figure lands near
     *  the split between the two groups rather than merely somewhere lower. */
    it('finds a figure it was given', () => {
      const { nights, predictions } = fortnight(6)

      expect(enoughSleepFor(nights, predictions)).toBeCloseTo(6.5, 5)
    })

    /**
     * One catastrophic day among ordinary ones must not swing the figure. A single residual
     * of -60 is a day that went wrong for reasons sleep cannot explain, and a learner without
     * this produces a confident wrong number -- which this project calls worse than none.
     */
    it('is barely moved by a single disastrous day', () => {
      const nights = [6, 6, 6, 9, 9, 9].map((hours, index) => night(index + 1, hours))
      const predictions = [60, 60, 60, 60, 60, 0].map((reported, index) =>
        felt(index + 1, 60, reported),
      )

      expect(enoughSleepFor(nights, predictions)).toBeGreaterThan(ENOUGH_SLEEP_HOURS - 1)
    })

    it('never reports a figure outside what a night could believably be', () => {
      const absurdlyWorse = fortnight(7, 900)
      const absurdlyBetter = fortnight(7, -900)

      expect(enoughSleepFor(absurdlyWorse.nights, absurdlyWorse.predictions)).toBeGreaterThanOrEqual(6)
      expect(enoughSleepFor(absurdlyBetter.nights, absurdlyBetter.predictions)).toBeLessThanOrEqual(12)
    })
  })
})

describe('sleepEnoughLine', () => {
  it('names the figure once one has been found', () => {
    expect(sleepEnoughLine(7, ENOUGH_SLEEP_HOURS)).toBe(
      'Your own nights suggest about 7 hours is enough for you — past that it stops adding much.',
    )
  })

  /** Nothing to say while the app is still on the population figure. Checked by absence
   *  rather than by empty text, so a blank element can never ship. */
  it('says nothing while nothing has been measured', () => {
    expect(sleepEnoughLine(ENOUGH_SLEEP_HOURS, ENOUGH_SLEEP_HOURS)).toBeNull()
  })

  /**
   * The student every night of whose fortnight sits below the ceiling and is still paying.
   * A version that only knew how to report a number would go silent on exactly the person
   * who most needs to hear something.
   */
  it('says more sleep is still paying when the figure went up', () => {
    expect(sleepEnoughLine(11, ENOUGH_SLEEP_HOURS)).toBe(
      'Your own nights suggest more sleep is still buying you something.',
    )
  })

  /** §8.2: it states and never instructs. Pinned as a rule rather than trusted to stay true,
   *  the same way the sleep reality line and the forecast already are. */
  it('states without instructing', () => {
    const said = `${sleepEnoughLine(7, ENOUGH_SLEEP_HOURS)} ${sleepEnoughLine(11, ENOUGH_SLEEP_HOURS)}`.toLowerCase()

    for (const word of ['should', 'need to', 'must', 'try to', 'only', 'fail']) {
      expect(said).not.toContain(word)
    }
  })
})
