import { describe, expect, it } from 'vitest'
import { sameFamily, taskKeyOf } from './taskKey'

/**
 * What a block's title says about which things are the same thing.
 *
 * Reality Check learns one multiplier per area of life -- study, body, people, admin -- so a
 * student whose essays run 3x over and whose lab reports land on time is told a single
 * averaged number about "study and writing". The finer bucket has to come from somewhere,
 * and the only thing a student reliably gives us is what they called it.
 *
 * The hard part is that people name by instance, not by category: "Lab report 3" is a
 * different string from "Lab report 4" while being the same kind of work. Matching titles
 * exactly would put one answer in each bucket and nothing would ever reach the threshold, so
 * a bucket per instance is the same as no buckets at all.
 *
 * Derived here rather than stored, deliberately. `BlockRecord` keeps the title the student
 * typed, and this runs on read -- so sharpening these rules re-groups every answer ever
 * given, instead of only the ones recorded after the change.
 */
describe('taskKeyOf', () => {
  it('lowercases and collapses whatever was typed', () => {
    expect(taskKeyOf('  Essay   DRAFT ').task).toBe('essay')
  })

  it('drops the instance number so a series lands in one bucket', () => {
    expect(taskKeyOf('Lab report 3').task).toBe(taskKeyOf('Lab report 4').task)
  })

  it('keeps a course code apart from the work itself', () => {
    const key = taskKeyOf('WIA3001 essay')

    expect(key.course).toBe('wia3001')
    expect(key.task).toBe('essay')
  })

  /** The caveat this whole split exists for: "Essay" and "WIA3001 essay" are the same work
   *  with and without the module named, and a student types both. */
  it('reads the same task whether or not the course was named', () => {
    expect(taskKeyOf('WIA3001 essay').task).toBe(taskKeyOf('Essay').task)
  })

  it('has no course when none was written', () => {
    expect(taskKeyOf('Gym').course).toBeNull()
  })

  it('drops the week number people put in front of readings', () => {
    expect(taskKeyOf('Week 5 reading').task).toBe(taskKeyOf('Week 9 reading').task)
  })

  /** Words that mark a stage rather than a kind of work. "Essay draft" and "Essay final" are
   *  the same task measured twice, and splitting them halves the evidence for both. */
  it('drops stage words that do not change what the work is', () => {
    expect(taskKeyOf('Essay draft').task).toBe(taskKeyOf('Essay final').task)
  })

  /** A title made entirely of things this strips would otherwise become the empty bucket,
   *  which every other such title would then join. */
  it('keeps the title itself when stripping would leave nothing', () => {
    expect(taskKeyOf('Draft 2').task).not.toBe('')
    expect(taskKeyOf('Draft 2').task).toBe(taskKeyOf('draft 2').task)
  })

  it('is stable under punctuation a student would not think about', () => {
    expect(taskKeyOf('WIA3001: essay!').task).toBe(taskKeyOf('WIA3001 essay').task)
  })
})

/**
 * Two keys describing the same family of work.
 *
 * Containment rather than equality: one title's words being wholly inside another's is how
 * the same thing gets typed two ways -- "gym" and "gym with sam", "call" and "call home".
 * Equality would leave those as separate buckets neither of which fills.
 */
describe('sameFamily', () => {
  it('treats identical keys as the same', () => {
    expect(sameFamily(taskKeyOf('Gym'), taskKeyOf('gym'))).toBe(true)
  })

  it('treats one title inside another as the same family', () => {
    expect(sameFamily(taskKeyOf('Gym'), taskKeyOf('Gym with Sam'))).toBe(true)
    expect(sameFamily(taskKeyOf('Call'), taskKeyOf('Call home'))).toBe(true)
  })

  it('is the same in both directions', () => {
    expect(sameFamily(taskKeyOf('Gym with Sam'), taskKeyOf('Gym'))).toBe(true)
  })

  it('keeps unrelated work apart', () => {
    expect(sameFamily(taskKeyOf('Essay'), taskKeyOf('Gym'))).toBe(false)
  })

  /** A course named on both sides has to agree, or WIA3001's essays would be learned from
   *  WIA2005's -- which is the entire thing this split was asked for. */
  it('keeps two courses apart even when the work is named the same', () => {
    expect(sameFamily(taskKeyOf('WIA3001 essay'), taskKeyOf('WIA2005 essay'))).toBe(false)
  })

  /** One side saying the course and the other not is the commonest way a student types the
   *  same work twice, so it stays one family. */
  it('matches a named course against an unnamed one', () => {
    expect(sameFamily(taskKeyOf('WIA3001 essay'), taskKeyOf('Essay'))).toBe(true)
  })
})
