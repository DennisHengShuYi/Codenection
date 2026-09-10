import { describe, expect, it } from 'vitest'
import { ACTIVITY_KINDS, BLOCK_KINDS, LOAD_TYPES } from '../../engine'
import { BLOCK_KIND_LABELS, LOAD_TYPE_LABELS } from './labels'

/**
 * One vocabulary, shared by the planner's chips and the week's edit form.
 *
 * Two copies is how the same thing comes to be called two different things on two screens
 * -- the fault Ruling 46 recorded for `BLOCK_KINDS`, where the picker stopped offering
 * `sleep` while the boundary went on accepting it because the rule was written down twice.
 */
describe('the vocabulary the pickers speak', () => {
  it('has a student’s word for every load type', () => {
    for (const type of LOAD_TYPES) {
      expect(LOAD_TYPE_LABELS[type]).toBeTruthy()
    }
  })

  // Keyed on every kind rather than only the selectable ones, so a picker can never render
  // blank if one that is not offered today ever reaches it.
  it('has a student’s word for every activity kind', () => {
    for (const kind of ACTIVITY_KINDS) {
      expect(BLOCK_KIND_LABELS[kind]).toBeTruthy()
    }
  })

  it('covers every kind a block may actually carry', () => {
    for (const kind of BLOCK_KINDS) {
      expect(BLOCK_KIND_LABELS[kind]).toBeTruthy()
    }
  })
})
