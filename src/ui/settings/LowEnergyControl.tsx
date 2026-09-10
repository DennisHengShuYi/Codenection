import { useId } from 'react'
import type { StoredSettings } from '../../data'

/**
 * The three states, with what each one means in the student's own terms.
 *
 * `auto` is first because it is the default and the one to come back to, and it is named
 * "Decide for me" rather than "Automatic" because that is the promise being made: the app
 * reads the reserve and picks, and the other two are the student overruling it.
 */
const OPTIONS: readonly {
  value: StoredSettings['lowEnergyOverride']
  label: string
  help: string
}[] = [
  {
    value: 'auto',
    label: 'Decide for me',
    help: 'Simplified when your reserve is low, everything otherwise.',
  },
  {
    value: 'on',
    label: 'Simplified interface',
    help: 'One number and one action, whatever your reserve is.',
  },
  {
    value: 'off',
    label: 'Full interface',
    help: 'Keep the week, the dial and the rest, even when your reserve is low.',
  },
]

/**
 * §1.5's manual override, given somewhere to be said.
 *
 * The rule this serves is bidirectional and the docstring on `lowEnergy.ts` states it: "The
 * manual setting wins in both directions. An interface a struggling student cannot dismiss
 * is one more thing being done to them." Both halves were lost when `LowEnergyView` was
 * deleted -- a student below 20% could not turn the collapsed interface off, and a student
 * above 20% who wanted it could not turn it on, which is the accessibility case and the
 * documented fallback for any screen that cannot be made to work at 320px.
 *
 * Three radios rather than a toggle. A toggle can only say on or off, so touching it once
 * would strand the student away from inferred behaviour permanently, with no way back --
 * the same shape of trap, wearing the fix's clothes.
 *
 * Lives in the settings sheet, which is reachable from inside the collapsed interface:
 * `open-settings` sits in `RoomShell`'s always-rendered header and is not gated on
 * `lowEnergy`. `RoomShell.lowEnergy.test.tsx` asserts that rather than assuming it, because
 * a control behind a door low-energy mode hides would fix nothing.
 */
export function LowEnergyControl({
  value,
  onChange,
}: {
  value: StoredSettings['lowEnergyOverride']
  onChange: (next: StoredSettings['lowEnergyOverride']) => void
}) {
  // One name per rendered group, so two of these on a page could not join into one set of
  // radios that overwrite each other.
  const name = useId()

  return (
    <fieldset
      data-testid="low-energy-control"
      className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm"
    >
      <legend className="font-medium">How much to show</legend>

      {OPTIONS.map((option) => (
        <label key={option.value} className="flex items-start gap-2">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="mt-1"
          />
          <span>
            <span className="block">{option.label}</span>
            <span className="block text-xs text-ink-soft">{option.help}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}
