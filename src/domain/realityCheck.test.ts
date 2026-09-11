import { describe, expect, it } from 'vitest'
import type { BlockOutcome } from './calibration'
import {
  biasLine,
  biasLineForBlock,
  MIN_SAMPLES,
  paddingDetail,
  paddingFor,
  paddingForItem,
} from './realityCheck'

const overran = (count: number, type: BlockOutcome['type'] = 'mental'): BlockOutcome[] =>
  Array.from({ length: count }, () => ({ type, plannedHours: 2, actualHours: 4 }))

describe('paddingFor', () => {
  /**
   * §7.4: estimate bias comes from day 7 onward. Before there is data the honest answer is
   * no padding at all -- a multiplier invented from nothing would silently distort every
   * projection while looking like a measurement.
   */
  it('pads nothing when there is no history', () => {
    expect(paddingFor([], 'mental')).toBe(1)
  })

  // One block that overran is noise, not a bias.
  it('pads nothing below the sample floor', () => {
    expect(paddingFor(overran(MIN_SAMPLES - 1), 'mental')).toBe(1)
  })

  it('pads once a consistent overrun has actually been shown', () => {
    expect(paddingFor(overran(MIN_SAMPLES), 'mental')).toBeGreaterThan(1)
  })

  it('pads roughly by how much was underestimated', () => {
    // Planned 2, took 4, so about twice.
    expect(paddingFor(overran(MIN_SAMPLES), 'mental')).toBeCloseTo(2, 1)
  })

  /**
   * An unbounded multiplier from a couple of bad weeks would put a student's fortnight into
   * fiction -- the same failure §7.2 warns about, arriving from the other direction.
   */
  it('stays bounded however badly the estimates went', () => {
    const disastrous = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 0.5,
      actualHours: 40,
    }))

    expect(paddingFor(disastrous, 'mental')).toBeLessThanOrEqual(3)
  })

  /**
   * §2.4 is about underestimation. Padding downward would quietly make a heavy week look
   * survivable, which is the opposite of what this app is for.
   */
  it('never pads below one when things finish early', () => {
    const early = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 4,
      actualHours: 1,
    }))

    expect(paddingFor(early, 'mental')).toBe(1)
  })

  it('keeps each load type independent', () => {
    const mixed = [...overran(MIN_SAMPLES, 'mental')]

    expect(paddingFor(mixed, 'mental')).toBeGreaterThan(1)
    expect(paddingFor(mixed, 'physical')).toBe(1)
  })

  it('ignores a block that was planned as nothing', () => {
    const zero = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 0,
      actualHours: 3,
    }))

    expect(paddingFor(zero, 'mental')).toBe(1)
  })
})

describe('biasLine', () => {
  // §7.6's payoff line, and §2.4's second surface.
  it('says nothing when nothing has been measured', () => {
    expect(biasLine([], 'mental')).toBeNull()
  })

  it('says nothing below the sample floor', () => {
    expect(biasLine(overran(MIN_SAMPLES - 1), 'mental')).toBeNull()
  })

  it('names the bias and the multiplier once it is real', () => {
    const line = biasLine(overran(MIN_SAMPLES), 'mental')

    expect(line).toMatch(/underestimate/i)
    expect(line).toMatch(/2(\.0)?×|2(\.0)?x/i)
  })

  // §2.4: "We pad it automatically." The student is told the correction is already applied.
  it('says the padding is applied automatically', () => {
    expect(biasLine(overran(MIN_SAMPLES), 'mental')).toMatch(/pad/i)
  })

  it('says nothing for someone who estimates well', () => {
    const accurate = Array.from({ length: 10 }, () => ({
      type: 'mental' as const,
      plannedHours: 2,
      actualHours: 2,
    }))

    expect(biasLine(accurate, 'mental')).toBeNull()
  })

  it("names the load type in the student's words rather than the model's", () => {
    expect(biasLine(overran(MIN_SAMPLES, 'mental'), 'mental')).not.toMatch(/\bmental\b/i)
  })
})

/**
 * The ladder: the narrowest bucket with enough evidence behind it wins.
 *
 * One multiplier per load type tells a student whose essays run 3x over and whose lab
 * reports land on time a single averaged number about "study and writing". Narrower buckets
 * fix that and bring their own problem -- the narrower the bucket, the slower it fills -- so
 * each rung needs more evidence than the one below it to take over, and a rung that has not
 * earned it falls through rather than going silent.
 *
 *   this exact work (5+)  ->  this kind of activity (4+)  ->  this area of life (3+)  ->  1
 *
 * The type level stays at three because it is the safety net. Raising it would leave a new
 * student with no correction at all while the narrow buckets fill.
 */
describe('paddingForItem', () => {
  const ran = (over: Partial<BlockOutcome> = {}): BlockOutcome => ({
    type: 'mental',
    kind: 'studyBlock',
    title: 'WIA3001 essay',
    plannedHours: 2,
    actualHours: 3,
    ...over,
  })

  const block = { type: 'mental' as const, kind: 'studyBlock' as const, title: 'WIA3001 essay' }

  it('uses the work itself once it has five answers', () => {
    const history = [
      ...Array.from({ length: 5 }, () => ran()),
      // Lab reports land on time, and used to drag the essay figure down with them.
      ...Array.from({ length: 5 }, () => ran({ title: 'WIA3001 lab report', actualHours: 2 })),
    ]

    expect(paddingForItem(history, block)).toBeCloseTo(1.5, 2)
  })

  it('falls to the kind when the work itself has too little behind it', () => {
    const history = [
      ...Array.from({ length: 2 }, () => ran()),
      ...Array.from({ length: 4 }, () => ran({ title: 'Revision', actualHours: 2 })),
    ]

    // Two essays is not a bucket. Six study blocks is: (3+3+2+2+2+2) / 12 = 1.166
    expect(paddingForItem(history, block)).toBeCloseTo(1.17, 2)
  })

  it('falls to the area of life when the kind has too little behind it', () => {
    const history = [
      ran({ kind: 'studyBlock', title: 'Essay' }),
      ran({ kind: 'studyBlock', title: 'Reading' }),
      ran({ kind: 'studyBlock', title: 'Revision' }),
    ]

    expect(paddingForItem(history, { ...block, kind: 'socialDraining' })).toBeCloseTo(1.5, 2)
  })

  it('pads nothing at all until some rung has enough', () => {
    expect(paddingForItem([ran()], block)).toBe(1)
  })

  /** The guardrail on containment: "Run" and "Run errands" share a word and nothing else. */
  it('never learns one kind of work from another that merely sounds like it', () => {
    const history = Array.from({ length: 5 }, () =>
      ran({ kind: 'errands', type: 'errands', title: 'Run errands', actualHours: 6 }),
    )

    const run = { type: 'physical' as const, kind: 'lightExercise' as const, title: 'Run' }

    expect(paddingForItem(history, run)).toBe(1)
  })

  /** A record written before titles were kept, or by a path that has none, still counts at
   *  the rungs that do not need one. */
  it('still uses an untitled history at the kind and type levels', () => {
    const history = Array.from({ length: 4 }, () => ran({ title: undefined }))

    expect(paddingForItem(history, block)).toBeCloseTo(1.5, 2)
  })
})

/**
 * Saying the figure that is actually charged, and naming what it is about.
 *
 * `biasLine` quoted `paddingFor` -- the area-of-life figure -- while the engine charged
 * `paddingForItem`, which prefers the narrower rungs. So the app could tell a student "study
 * and writing, about 1.4x" while charging their essays 1.9x, and could announce a padding on
 * a task whose own bucket sits at 1.0 because their *other* study runs long. The sentence is
 * the only place any of this is visible, so it has to be the figure in use.
 *
 * Which rung spoke decides the words as well as the number: "your essays" and "study and
 * writing" are different claims, and a student reading the narrower one deserves to know it
 * is about that particular work.
 */
describe('paddingDetail', () => {
  const ran = (over: Partial<BlockOutcome> = {}): BlockOutcome => ({
    type: 'mental',
    kind: 'studyBlock',
    title: 'WIA3001 essay',
    plannedHours: 2,
    actualHours: 3,
    ...over,
  })

  const block = { type: 'mental' as const, kind: 'studyBlock' as const, title: 'WIA3001 essay' }

  it('says the task rung spoke when the work has its own history', () => {
    const detail = paddingDetail(Array.from({ length: 5 }, () => ran()), block)

    expect(detail.rung).toBe('task')
    expect(detail.padding).toBeCloseTo(1.5, 2)
  })

  it('says the kind rung spoke when the work itself is too thin', () => {
    const history = [
      ...Array.from({ length: 2 }, () => ran()),
      ...Array.from({ length: 3 }, () => ran({ title: 'Revision' })),
    ]

    expect(paddingDetail(history, block).rung).toBe('kind')
  })

  it('says the area rung spoke when the kind is too thin', () => {
    const history = Array.from({ length: 3 }, () => ran({ kind: 'socialDraining', title: 'x' }))

    expect(paddingDetail(history, { ...block, kind: 'lightExercise' }).rung).toBe('type')
  })

  it('says nothing spoke when no rung has enough', () => {
    expect(paddingDetail([ran()], block)).toEqual({ padding: 1, rung: 'none' })
  })

  /** The two must never disagree: one is the sentence and the other is the charge. */
  it('agrees with what the engine is charged', () => {
    const history = Array.from({ length: 5 }, () => ran())

    expect(paddingDetail(history, block).padding).toBe(paddingForItem(history, block))
  })
})

describe('biasLineForBlock', () => {
  const ran = (title: string, actualHours: number): BlockOutcome => ({
    type: 'mental',
    kind: 'studyBlock',
    title,
    plannedHours: 2,
    actualHours,
  })

  const block = { type: 'mental' as const, kind: 'studyBlock' as const, title: 'WIA3001 essay' }

  it('names the work itself when that is what was measured', () => {
    const line = biasLineForBlock(Array.from({ length: 5 }, () => ran('WIA3001 essay', 4)), block)

    expect(line).toContain('WIA3001 essay')
    expect(line).toMatch(/2×|2\.0×/)
  })

  it('names the area when that is the rung that spoke', () => {
    const history = [
      ...Array.from({ length: 3 }, () => ran('Revision', 4)),
      ...Array.from({ length: 2 }, () => ran('Reading', 4)),
    ]

    expect(biasLineForBlock(history, { ...block, kind: 'socialDraining' })).toContain(
      'study and writing',
    )
  })

  /** Silent about a task that is not being padded, however long the student's other work of
   *  the same kind runs -- the old line spoke for the area and got this backwards. */
  it('says nothing when this particular work is not padded', () => {
    const history = [
      ...Array.from({ length: 5 }, () => ran('WIA3001 essay', 2)),
      ...Array.from({ length: 5 }, () => ran('Thesis', 6)),
    ]

    expect(biasLineForBlock(history, block)).toBeNull()
  })

  it('says nothing when there is not enough history at any rung', () => {
    expect(biasLineForBlock([ran('WIA3001 essay', 4)], block)).toBeNull()
  })
})
