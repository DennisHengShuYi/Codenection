import type { ActivityKind } from '../engine'
import type { Schedule } from '../optimizer'
import type { BlockRecord } from './blockLog'

/** Long enough to hold a student's real vocabulary -- modules, a gym habit, a weekly shift,
 *  the Sunday call home -- and short enough to read. Past this a dropdown is a search. */
const MOST_OFFERED = 12

/** A name this student uses, and what they use it for. */
export interface KnownTitle {
  readonly title: string
  /**
   * The kind it is usually used for, or null when nothing recorded one.
   *
   * Carried because snapping a model's phrasing onto one of these is guarded by kind: "Run"
   * must never be snapped onto "Run errands", and the words alone cannot tell them apart.
   */
  readonly kind: ActivityKind | null
}

interface Use {
  /** The spelling seen most often, which is the one to offer back. */
  label: string
  count: number
  lastUsed: number
  /** Per spelling, so the winner is the commonest rather than the first seen. */
  spellings: Map<string, number>
  /** Per kind, for the same reason: the one it is usually used for wins. */
  kinds: Map<ActivityKind, number>
}

/**
 * The names this student has used, most-used first.
 *
 * §2.4's narrow rungs group answers by title, and `taskKey` collapses what it can -- but the
 * cheapest fix for "gym" and "Gym session" landing in two buckets is the student never
 * typing the second one. Offered back while they type, the name they already use is one tap
 * away and the split never happens.
 *
 * Read from two places deliberately. The block log is what has been answered for, which is
 * what the buckets are made of; the week is what has been written down since, including
 * something typed an hour ago and not yet lived. A vocabulary from the log alone would
 * forget a name until its first answer came in, which is precisely the window where a second
 * spelling gets invented.
 *
 * Pure, and no clock: `answeredAt` orders the log and the week's own order stands in for
 * recency, so this can be reasoned about without a calendar.
 */
export function titleVocabulary({
  schedule,
  blockLog,
}: {
  readonly schedule: Schedule
  readonly blockLog: readonly BlockRecord[]
}): readonly KnownTitle[] {
  const uses = new Map<string, Use>()

  const seen = (rawTitle: string | undefined, at: number, kind?: ActivityKind): void => {
    const title = rawTitle?.trim() ?? ''
    if (title === '') return

    // Case-folded, so "gym" and "Gym" are one entry competing over which spelling is shown
    // rather than two lines offering the same thing.
    const key = title.toLowerCase()
    const use = uses.get(key) ?? {
      label: title,
      count: 0,
      lastUsed: at,
      spellings: new Map(),
      kinds: new Map(),
    }

    use.count += 1
    use.lastUsed = Math.max(use.lastUsed, at)
    use.spellings.set(title, (use.spellings.get(title) ?? 0) + 1)
    if (kind !== undefined) use.kinds.set(kind, (use.kinds.get(kind) ?? 0) + 1)
    uses.set(key, use)
  }

  for (const entry of blockLog) seen(entry.title, entry.answeredAt, entry.kind)

  // Above any timestamp the log can hold, because the week is now and the log is the past.
  // Using the index directly made every week-only name older than every answered one, so
  // something typed an hour ago sank below a module last answered in September.
  const NOW = Number.MAX_SAFE_INTEGER - schedule.items.length
  schedule.items.forEach((item, index) => seen(item.title, NOW + index, item.kind))

  const commonest = <Value,>(counts: Map<Value, number>): Value | null =>
    [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null

  return [...uses.values()]
    .sort((left, right) => right.count - left.count || right.lastUsed - left.lastUsed)
    .slice(0, MOST_OFFERED)
    .map((use) => ({ title: commonest(use.spellings) ?? use.label, kind: commonest(use.kinds) }))
}
