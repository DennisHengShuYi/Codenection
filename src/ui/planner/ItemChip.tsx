import type { ParsedItem } from '../../ai'
import { LOAD_TYPES, type LoadType } from '../../engine'

/** The engine's vocabulary in a student's words. "Mental load" is a modelling term; "study
 *  and thinking" is what someone recognises as their own week. */
const LABELS: Record<LoadType, string> = {
  mental: 'Study & thinking',
  physical: 'Body & movement',
  social: 'People',
  errands: 'Life admin',
}

export function ItemChip({
  item,
  onChange,
  onRemove,
}: {
  item: ParsedItem
  onChange: (next: ParsedItem) => void
  onRemove: (id: string) => void
}) {
  return (
    <li data-testid={`chip-${item.id}`} className="flex flex-col gap-2 rounded-lg bg-slate-100 p-3">
      <label className="flex flex-col gap-1 text-xs">
        What
        <input
          value={item.title}
          onChange={(event) => onChange({ ...item, title: event.target.value })}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Kind
          <select
            value={item.type}
            onChange={(event) => onChange({ ...item, type: event.target.value as LoadType })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {LOAD_TYPES.map((type) => (
              <option key={type} value={type}>
                {LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          Hours
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={item.hours}
            onChange={(event) => onChange({ ...item, hours: Number(event.target.value) })}
            className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>

        <button type="button" onClick={() => onRemove(item.id)} className="ml-auto text-sm underline">
          Remove
        </button>
      </div>

      {/* §1.4: flagged rather than silently guessed. A student cannot correct what they
          were never shown. */}
      {!item.confident && (
        <p data-testid={`unsure-${item.id}`} className="text-xs text-amber-800">
          Not sure about this one — check it before adding.
        </p>
      )}
    </li>
  )
}
