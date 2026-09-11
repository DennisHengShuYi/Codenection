import { answeredIds, type BlockRecord } from '../../domain/blockLog'
import { blocksOnDay } from '../../domain/dayBlocks'
import type { ActivityKind } from '../../engine'
import type { Schedule } from '../../optimizer'

/** One block behind a row, as the panel needs to say it. */
export interface PanelBlock {
  readonly id: string
  readonly title: string
  readonly startHour: number
  readonly hours: number
  /** Answered on the today card. The room puts these away; the list marks them done. */
  readonly done: boolean
}

export interface PanelRow {
  readonly id: string
  readonly label: string
  /** What the object means, in the student's terms. This is the legend. */
  readonly meaning: string
  /** Hours of today this row accounts for. Zero is an ordinary answer. */
  readonly hours: number
  /** How many things, where counting is the honest measure -- a box is one errand,
   *  not half an hour of one. */
  readonly count: number
  readonly blocks: readonly PanelBlock[]
  /** Whether the room draws it. False for rest, which §45 left deliberately without an
   *  object: it is the one thing on a day that is not a duty owed to anyone. */
  readonly drawn: boolean
}

/**
 * The groupings the room binds its furniture from.
 *
 * Read from one place so the panel and the drawing cannot come to disagree: a legend that
 * teaches a vocabulary the room does not speak is worse than no legend, because the student
 * trusts it.
 *
 * Hard and light exercise share an object, and both kinds of company share another, for
 * §45's reason -- those splits are about what an hour COSTS, which the reserve models and
 * the breakdown states, while the room is only saying a session is on.
 */
const GROUPS: readonly {
  readonly id: string
  readonly label: string
  readonly meaning: string
  readonly kinds: readonly ActivityKind[]
  readonly counted?: boolean
  readonly drawn?: boolean
}[] = [
  { id: 'books', label: 'Books', meaning: 'study — the stack on the desk grows with it', kinds: ['studyBlock'] },
  {
    id: 'dumbbell',
    label: 'Dumbbell',
    meaning: 'exercise, hard or light — it gets heavier, not doubled',
    kinds: ['hardExercise', 'lightExercise'],
  },
  {
    id: 'people',
    label: 'People',
    meaning: 'time with people — more hours, more of them in the room',
    kinds: ['socialDraining', 'socialRestorative'],
  },
  {
    id: 'boxes',
    label: 'Boxes',
    meaning: 'errands waiting — one box each',
    kinds: ['errands'],
    counted: true,
  },
]

const REST_GROUP = {
  id: 'rest',
  label: 'Rest',
  meaning: 'nothing in the room draws it — rest is not a duty you owe anyone',
  kinds: ['rest'] as readonly ActivityKind[],
  drawn: false,
}

/**
 * §46: what each object means and what is behind it today, in one list.
 *
 * Named `todayRows` rather than `todayPanel` for a reason worth keeping: `TodayPanel.tsx`
 * sits beside it, and on a case-insensitive filesystem two modules differing only by case
 * resolve to whichever one the resolver reaches first. The component imported itself and
 * rendered `undefined`, which React reports as "Element type is invalid" -- a confusing
 * error a long way from its cause.
 *
 * The legend and the day's list are the same thing, because every row names a real thing on
 * today -- a separate always-on legend would repeat itself daily once the vocabulary is
 * learned.
 *
 * Pure, and knows nothing about panels or sheets: `TodayPanel` renders these rows in two
 * containers at two widths, and neither placement is a property of what today contains.
 */
export function panelRowsFor(
  schedule: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
): readonly PanelRow[] {
  // `blocksOnDay` rather than a filter of its own -- it already orders by start hour, which
  // is what a list of a day has to do anyway, and §45's `dayLoad` shares the same answer.
  const onToday = blocksOnDay(schedule, today)
  const answered = new Set(answeredIds(blockLog))

  const rowFor = (group: (typeof GROUPS)[number] | typeof REST_GROUP): PanelRow => {
    const blocks = onToday
      .filter((item) => group.kinds.includes(item.kind))
      .map((item) => ({
        id: item.id,
        title: item.title,
        startHour: item.startHour,
        hours: item.hours,
        done: answered.has(item.id),
      }))

    return {
      id: group.id,
      label: group.label,
      meaning: group.meaning,
      hours: blocks.reduce((total, entry) => total + entry.hours, 0),
      count: blocks.length,
      blocks,
      drawn: group.drawn ?? true,
    }
  }

  const bed: PanelRow = {
    id: 'bed',
    label: 'Bed',
    /**
     * Worded as the week's own figure rather than as a claim about the student's night.
     * `sleepByDay` defaults to 7 for a night nobody has answered, and nothing records
     * whether it was answered -- so this row cannot tell "you slept seven hours" from
     * "nobody has asked yet", and must not pretend otherwise.
     */
    meaning: 'sleep on this day, as the week has it',
    hours: schedule.sleepByDay[today] ?? 0,
    count: 0,
    blocks: [],
    drawn: true,
  }

  return [...GROUPS.map(rowFor), bed, rowFor(REST_GROUP)]
}
