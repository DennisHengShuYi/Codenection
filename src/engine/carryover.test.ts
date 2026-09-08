import { describe, expect, it } from 'vitest'
import { carryoverAt } from './carryover'
import type { Activity } from './types'

const gym: Activity = {
  kind: 'hardExercise',
  type: 'physical',
  hours: 1,
  intensity: 1,
  startHour: 17,
}

const walk: Activity = {
  kind: 'lightExercise',
  type: 'physical',
  hours: 0.5,
  intensity: 1,
  startHour: 17,
}

describe('carryoverAt', () => {
  it('applies the full cross-effect immediately after the activity ends', () => {
    expect(carryoverAt([gym], 18).mental).toBeCloseTo(-0.25)
  })

  it('decays toward zero as hours pass', () => {
    const soon = carryoverAt([gym], 18).mental
    const later = carryoverAt([gym], 21).mental

    expect(later).toBeGreaterThan(soon)
    expect(later).toBeLessThan(0)
    expect(carryoverAt([gym], 40).mental).toBeCloseTo(0, 1)
  })

  it('ignores activities that have not happened yet', () => {
    expect(carryoverAt([gym], 12).mental).toBe(0)
  })

  it('ignores an activity that is still in progress', () => {
    expect(carryoverAt([gym], 17.5).mental).toBe(0)
  })

  // §6.6's positive entries are load-bearing: this is what makes a walk not merely rest
  // but a purchase of a better study block, and it is why the app's own recovery
  // suggestions are self-justifying rather than merely virtuous.
  it('raises mental capacity after light movement', () => {
    expect(carryoverAt([walk], 18).mental).toBeGreaterThan(0)
  })

  it('sums concurrent residues', () => {
    const study: Activity = {
      kind: 'studyBlock',
      type: 'mental',
      hours: 2,
      intensity: 1,
      startHour: 14,
    }

    expect(carryoverAt([gym, study], 18).mental).toBeLessThan(carryoverAt([gym], 18).mental)
  })

  it('scales with intensity', () => {
    const easier: Activity = { ...gym, intensity: 0.5 }

    expect(carryoverAt([easier], 18).mental).toBeGreaterThan(carryoverAt([gym], 18).mental)
  })

  // Sleep is a full reset (§6.6), not a trailing effect, so it must leave nothing behind.
  it('leaves no residue from sleep', () => {
    const slept: Activity = {
      kind: 'sleep',
      type: 'physical',
      hours: 8,
      intensity: 1,
      startHour: 0,
    }

    expect(carryoverAt([slept], 10).mental).toBe(0)
  })

  it('returns all zeroes for an empty day', () => {
    expect(carryoverAt([], 12)).toEqual({ mental: 0, physical: 0, social: 0, errands: 0 })
  })
})
