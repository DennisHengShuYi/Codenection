import { describe, expect, it } from 'vitest'
import { MAX_TASK_LENGTH, MICRO_START_MINUTES, microStartFrom, microStartPrompt } from './microStart'

describe('microStartPrompt', () => {
  it('names the task it is about', () => {
    expect(microStartPrompt('finish the ethics essay')).toContain('finish the ethics essay')
  })

  // §4.1: one concrete first action with a time box under ten minutes. The prompt has to
  // say so, because a model left to itself returns a plan.
  it('asks for one action, time-boxed', () => {
    const prompt = microStartPrompt('essay')

    expect(prompt).toMatch(/one/i)
    expect(prompt).toContain(String(MICRO_START_MINUTES))
  })

  // A paragraph pasted in as a "task" would otherwise become the prompt.
  it('shortens a task too long to be a task', () => {
    const prompt = microStartPrompt('e'.repeat(MAX_TASK_LENGTH + 500))

    expect(prompt.length).toBeLessThan(MAX_TASK_LENGTH + 400)
  })
})

describe('microStartFrom', () => {
  it('uses what the model said', () => {
    const result = microStartFrom('essay', 'Open the document and write the title.')

    expect(result.action).toBe('Open the document and write the title.')
    expect(result.source).toBe('model')
  })

  /**
   * §4.1: one action, never a list. A stuck person cannot choose from a menu any more than
   * a depleted one can (§5.2), so if the model returns several, only the first survives.
   */
  it('keeps only the first action when the model returns a list', () => {
    const result = microStartFrom('essay', '1. Open the document\n2. Write an outline\n3. Draft')

    expect(result.action).not.toContain('outline')
    expect(result.action.split('\n')).toHaveLength(1)
  })

  it('strips list markers so it reads as a sentence', () => {
    expect(microStartFrom('essay', '- Open the document').action).toBe('Open the document')
    expect(microStartFrom('essay', '1. Open the document').action).toBe('Open the document')
  })

  // The state CI and the demo run in. §4.1 has to answer with no key at all, or the button
  // does nothing for most of the sessions this app will ever have.
  it('falls back to a rule when there is no model reply', () => {
    const result = microStartFrom('the ethics essay', null)

    expect(result.source).toBe('fallback')
    expect(result.action.length).toBeGreaterThan(0)
  })

  it('falls back when the model returned nothing usable', () => {
    expect(microStartFrom('essay', '   ').source).toBe('fallback')
    expect(microStartFrom('essay', '').source).toBe('fallback')
  })

  it('names the task in the fallback, so it is about their thing', () => {
    expect(microStartFrom('the ethics essay', null).action).toContain('ethics essay')
  })

  /**
   * §4.1 requires zero friction and asks for no explanation. §1.3's rule that the app
   * reflects rather than scolds applies here more than anywhere: somebody using this has
   * already told you they are stuck.
   */
  it('does not scold, apologise, or ask why', () => {
    for (const reply of [null, 'Open the document and write the title.']) {
      const { action } = microStartFrom('essay', reply)

      expect(action).not.toMatch(/why|should have|just |simply|sorry|try harder/i)
    }
  })

  it('shortens an over-long action rather than sending a paragraph', () => {
    const result = microStartFrom('essay', 'x'.repeat(1000))

    expect(result.action.length).toBeLessThan(400)
  })
})
