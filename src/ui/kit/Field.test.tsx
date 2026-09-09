import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

describe('Field', () => {
  it('labels its control', () => {
    render(
      <Field label="What you were asked">
        <textarea />
      </Field>,
    )

    expect(screen.getByLabelText('What you were asked')).toBeInTheDocument()
  })

  it('describes its control with the help text', () => {
    render(
      <Field label="Hours" help="Roughly is fine">
        <input />
      </Field>,
    )

    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('Roughly is fine')
  })

  it('announces an error and prefers it over the help text', () => {
    render(
      <Field label="Hours" help="Roughly is fine" error="That is not a number">
        <input />
      </Field>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('That is not a number')
    expect(screen.getByLabelText('Hours')).toHaveAccessibleDescription('That is not a number')
  })
})
