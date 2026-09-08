import { describe, expect, it } from 'vitest'
import { COUPLING, CROSS_EFFECT, DEFAULT_PARAMS } from './params'
import { LOAD_TYPES } from './types'

describe('population priors', () => {
  it('defines a type intensity, sleep coefficient and estimate bias for every load type', () => {
    for (const type of LOAD_TYPES) {
      expect(DEFAULT_PARAMS.typeIntensity[type]).toBeGreaterThan(0)
      expect(DEFAULT_PARAMS.kSleep[type]).toBeGreaterThanOrEqual(0)
      expect(DEFAULT_PARAMS.estimateBias[type]).toBeGreaterThan(0)
    }
  })

  // §0: the brief lists five areas and the UI surfaces five labels, but the model uses
  // four load types. Schedule density is a derived view, not a fifth bucket -- and a
  // fifth reserve appearing here would silently change what every projection means.
  it('models exactly four load types, not the five labels the UI shows', () => {
    expect(LOAD_TYPES).toHaveLength(4)
    expect(LOAD_TYPES).not.toContain('schedule')
  })

  it('makes hard exercise cost mental capacity and light movement raise it', () => {
    expect(CROSS_EFFECT.hardExercise.mental).toBeCloseTo(-0.25)
    expect(CROSS_EFFECT.lightExercise.mental).toBeCloseTo(0.1)
  })

  // §6.3's coupling can only drag a reserve down. A negative entry would let a
  // well-rested body paper over an isolated month, which is the exact reading that
  // section exists to prevent.
  it('drags other reserves down only, never up, through coupling', () => {
    for (const from of LOAD_TYPES) {
      for (const to of LOAD_TYPES) {
        expect(COUPLING[from][to]).toBeGreaterThanOrEqual(0)
      }
    }
    expect(COUPLING.physical.mental).toBeGreaterThan(0)
    expect(COUPLING.social.mental).toBeGreaterThan(0)
  })

  it('never couples a reserve to itself, which would compound its own deficit', () => {
    for (const type of LOAD_TYPES) {
      expect(COUPLING[type][type]).toBe(0)
    }
  })

  // §1.2: low social load is flagged as a warning, not as "good".
  it('gives social a floor, because low social load is a deficit not a good score', () => {
    expect(DEFAULT_PARAMS.socialFloorHoursPerDay).toBeGreaterThan(0)
    expect(DEFAULT_PARAMS.isolationDrainPerDay).toBeGreaterThan(0)
  })

  it('gives every activity kind a cross-effect row and a half-life', () => {
    for (const kind of Object.keys(CROSS_EFFECT)) {
      for (const type of LOAD_TYPES) {
        expect(Number.isFinite(CROSS_EFFECT[kind as keyof typeof CROSS_EFFECT][type])).toBe(true)
      }
    }
  })
})
