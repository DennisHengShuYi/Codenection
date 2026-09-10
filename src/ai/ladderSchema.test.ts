import { describe, expect, it } from 'vitest'
import { parseLadderReply } from './ladderSchema'

const rungs = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ action: `do thing ${index}`, minutes: 5 }))

describe('parseLadderReply', () => {
  it('accepts a well-formed chain', () => {
    expect(parseLadderReply({ steps: rungs(4) })).toHaveLength(4)
  })

  // The wrapper is our request, and dropping it is the most common way a model deviates.
  // The same allowance the planner's and drafter's schemas already make.
  it('accepts a bare array as the chain', () => {
    expect(parseLadderReply(rungs(3))).toHaveLength(3)
  })

  it('refuses a chain shorter than three', () => {
    expect(parseLadderReply({ steps: rungs(2) })).toBeNull()
  })

  it('refuses a chain longer than six', () => {
    expect(parseLadderReply({ steps: rungs(7) })).toBeNull()
  })

  // §4.1's time box is a promise made to the student on screen. A schema that let an
  // eleven-minute rung through would print that promise next to a number breaking it.
  it('refuses a rung over the time box', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'a long one', minutes: 11 }] })).toBeNull()
  })

  it('refuses a rung with no time at all', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'no time', minutes: 0 }] })).toBeNull()
  })

  it('refuses a fractional number of minutes', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'half', minutes: 2.5 }] })).toBeNull()
  })

  it('refuses an empty action', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: '   ', minutes: 4 }] })).toBeNull()
  })

  it('refuses an action longer than one instruction', () => {
    expect(parseLadderReply({ steps: [...rungs(2), { action: 'x'.repeat(161), minutes: 4 }] })).toBeNull()
  })

  it('refuses a reply that is not an object at all', () => {
    expect(parseLadderReply('steps: open the document')).toBeNull()
    expect(parseLadderReply(null)).toBeNull()
  })

  // All-or-nothing, like `parseModelReply` and `parseDraftReply`. A partially valid chain
  // is a chain with a hole in it, and the hole is invisible on a page showing one rung.
  it('refuses the whole chain when one rung is malformed', () => {
    expect(parseLadderReply({ steps: [...rungs(3), { action: 'fine', minutes: 'soon' }] })).toBeNull()
  })

  it('trims the whitespace a model leaves around an action', () => {
    expect(parseLadderReply({ steps: [{ action: '  open it  ', minutes: 2 }, ...rungs(2)] })?.[0]?.action).toBe(
      'open it',
    )
  })
})
