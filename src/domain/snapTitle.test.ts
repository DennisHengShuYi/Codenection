import { describe, expect, it } from 'vitest'
import type { KnownTitle } from './titleVocabulary'
import { snapTitle } from './snapTitle'

/**
 * The model's phrasing, pulled back onto the student's own words.
 *
 * §2.4's narrow rungs group answers by title, and on the AI paths the title is not the
 * student's -- it is whatever the model wrote from their sentence. From one habit it will
 * produce "Gym session" this week and "Workout" the next, and each phrasing is a bucket
 * starting at zero answers. Nothing ever fills, and the feature is quietly dead for everyone
 * who does not type their own blocks.
 *
 * Telling the model the list helps and cannot be relied on -- a prompt is advice. This runs
 * on the answer, so it holds whatever the model felt like saying.
 *
 * Guarded by kind, because the words alone cannot tell "Run" from "Run errands": one is a
 * light jog and the other is an afternoon of admin, and merging them would teach each from
 * the other. Same guard, same matcher as the buckets themselves (`taskKey.sameFamily`), so
 * there is one rule deciding what counts as the same thing rather than two that drift.
 */
const known = (title: string, kind: KnownTitle['kind']): KnownTitle => ({ title, kind })

describe('snapTitle', () => {
  it('pulls a longer phrasing back to the name already in use', () => {
    expect(
      snapTitle({ title: 'Gym session', kind: 'hardExercise' }, [known('Gym', 'hardExercise')]),
    ).toBe('Gym')
  })

  it('leaves a name that is already the one in use', () => {
    expect(snapTitle({ title: 'Gym', kind: 'hardExercise' }, [known('Gym', 'hardExercise')])).toBe(
      'Gym',
    )
  })

  it('leaves something genuinely new exactly as it was written', () => {
    expect(
      snapTitle({ title: 'Rock climbing', kind: 'hardExercise' }, [known('Gym', 'hardExercise')]),
    ).toBe('Rock climbing')
  })

  /** The guard. Containment alone would make an afternoon of admin into a jog. */
  it('never snaps across kinds, however alike the words', () => {
    expect(
      snapTitle({ title: 'Run', kind: 'lightExercise' }, [known('Run errands', 'errands')]),
    ).toBe('Run')
  })

  it('matches a course the student named against one they did not', () => {
    expect(
      snapTitle({ title: 'Essay', kind: 'studyBlock' }, [known('WIA3001 essay', 'studyBlock')]),
    ).toBe('WIA3001 essay')
  })

  it('keeps two courses apart even when the work is named the same', () => {
    expect(
      snapTitle({ title: 'WIA2005 essay', kind: 'studyBlock' }, [
        known('WIA3001 essay', 'studyBlock'),
      ]),
    ).toBe('WIA2005 essay')
  })

  /** A name recorded before kinds were kept says nothing about what it was for, and a guard
   *  that cannot check is a guard that must not fire. */
  it('will not snap onto a name whose kind was never recorded', () => {
    expect(snapTitle({ title: 'Gym session', kind: 'hardExercise' }, [known('Gym', null)])).toBe(
      'Gym session',
    )
  })

  it('takes the first match when the list holds more than one', () => {
    const vocabulary = [known('Gym', 'hardExercise'), known('Gym with Sam', 'hardExercise')]

    expect(snapTitle({ title: 'Gym session', kind: 'hardExercise' }, vocabulary)).toBe('Gym')
  })

  it('changes nothing when there is no vocabulary at all', () => {
    expect(snapTitle({ title: 'Gym session', kind: 'hardExercise' }, [])).toBe('Gym session')
  })

  it('leaves a blank title alone rather than snapping it onto everything', () => {
    expect(snapTitle({ title: '   ', kind: 'hardExercise' }, [known('Gym', 'hardExercise')])).toBe(
      '   ',
    )
  })
})
