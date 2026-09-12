import { describe, expect, it } from 'vitest'
import { readVocabulary, vocabularyLines } from './vocabulary'

/**
 * The names a student already uses, on their way to the model.
 *
 * Checked at the boundary like everything else that arrives over the wire. Nothing
 * downstream re-checks it, so nothing downstream may assume it was checked -- and this one
 * ends up inside a prompt, where an unbounded list is a bill and a long enough entry is an
 * instruction somebody else wrote.
 *
 * It is advice to the model and nothing more. `domain/snapTitle` runs on the reply and is
 * what actually holds the naming together; this only raises the odds the model gets there by
 * itself.
 */
describe('readVocabulary', () => {
  it('keeps a plain list of names', () => {
    expect(readVocabulary(['Gym', 'WIA3001 lab'])).toEqual(['Gym', 'WIA3001 lab'])
  })

  it('is empty for anything that is not a list', () => {
    expect(readVocabulary(undefined)).toEqual([])
    expect(readVocabulary('Gym')).toEqual([])
    expect(readVocabulary({ 0: 'Gym' })).toEqual([])
  })

  it('drops entries that are not names', () => {
    expect(readVocabulary(['Gym', 42, null, { title: 'x' }])).toEqual(['Gym'])
  })

  it('drops blank entries rather than sending empty lines', () => {
    expect(readVocabulary(['Gym', '   ', ''])).toEqual(['Gym'])
  })

  it('trims what it keeps', () => {
    expect(readVocabulary(['  Gym  '])).toEqual(['Gym'])
  })

  /** A name is a handful of words. Anything longer is not a title a student typed, and a
   *  prompt is the wrong place to find out what it is instead. */
  it('drops an entry too long to be a name', () => {
    expect(readVocabulary(['Gym', 'x'.repeat(200)])).toEqual(['Gym'])
  })

  /** Unbounded input reaching a prompt is a bill someone else writes. */
  it('stops at a length worth sending', () => {
    const many = Array.from({ length: 60 }, (_, index) => `Name ${index}`)

    expect(readVocabulary(many).length).toBeLessThanOrEqual(12)
  })
})

describe('vocabularyLines', () => {
  it('says nothing at all when there are no names', () => {
    expect(vocabularyLines([])).toBe('')
  })

  it('names them and asks the model to reuse them', () => {
    const lines = vocabularyLines(['Gym', 'WIA3001 lab'])

    expect(lines).toContain('Gym')
    expect(lines).toContain('WIA3001 lab')
    expect(lines).toMatch(/exact|same/i)
  })

  /** The instruction has to leave room for something genuinely new, or the model starts
   *  forcing a rock-climbing session into "Gym" to obey. */
  it('leaves room for a name that is genuinely new', () => {
    expect(vocabularyLines(['Gym'])).toMatch(/new|different|otherwise|does not/i)
  })
})
