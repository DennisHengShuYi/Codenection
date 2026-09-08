import type { EngineParams } from '../engine'
import { isValid } from './constraints'
import type { Move, Schedule, ScheduledItem } from './types'

/** How far a single move may shift a task. Small on purpose: §2.2 observes that a
 *  student will do one thing, so the neighbourhood is built from changes a person could
 *  actually be asked to make. */
const DAY_SHIFTS = [-2, -1, 1, 2]

const REST_HOURS = 2
const REST_START_HOUR = 20

const replace = (schedule: Schedule, id: string, next: ScheduledItem): Schedule => ({
  ...schedule,
  items: schedule.items.map((item) => (item.id === id ? next : item)),
})

/**
 * §2.1's movable set: soft deadlines, undated work, errands.
 *
 * Everything fixed stays put, and protected rest is not merely fixed but untouchable --
 * checked here at generation rather than only at validation, because a search that can
 * *reach* a state where rest has moved is a search that treats rest as negotiable.
 */
const isMovable = (item: ScheduledItem): boolean => !item.fixed && !item.protectedRest

function shiftMoves(schedule: Schedule): Move[] {
  const moves: Move[] = []

  for (const item of schedule.items.filter(isMovable)) {
    for (const delta of DAY_SHIFTS) {
      const dayIndex = item.dayIndex + delta
      if (dayIndex < 0 || dayIndex >= schedule.horizonDays) continue
      if (item.deadlineDay !== null && dayIndex > item.deadlineDay) continue

      const direction = delta > 0 ? 'later' : 'earlier'
      const days = Math.abs(delta)

      moves.push({
        kind: 'shiftDay',
        itemId: item.id,
        description: `Moved ${item.title} ${days} day${days === 1 ? '' : 's'} ${direction}`,
        apply: (s) => replace(s, item.id, { ...item, dayIndex }),
      })
    }
  }

  return moves
}

/** §2.2: errand batching, by putting one errand immediately after another. */
function batchMoves(schedule: Schedule): Move[] {
  const errands = schedule.items.filter((item) => isMovable(item) && item.type === 'errands')
  const moves: Move[] = []

  for (const target of errands) {
    for (const other of errands) {
      if (other.id === target.id || other.dayIndex === target.dayIndex) continue
      if (other.deadlineDay !== null && target.dayIndex > other.deadlineDay) continue

      moves.push({
        kind: 'batchErrands',
        itemId: other.id,
        description: `Batched ${other.title} with ${target.title}`,
        apply: (s) =>
          replace(s, other.id, {
            ...other,
            dayIndex: target.dayIndex,
            startHour: target.startHour + target.hours,
          }),
      })
    }
  }

  return moves
}

/** §5.1: rest is a scheduled object with weight, which the solver can add to a week.
 *  Inserted as protected, so once placed it cannot be moved again. */
function restMoves(schedule: Schedule): Move[] {
  const moves: Move[] = []

  for (let day = 0; day < schedule.horizonDays; day += 1) {
    if (schedule.items.some((item) => item.dayIndex === day && item.kind === 'rest')) continue

    const id = `rest-${day}`

    moves.push({
      kind: 'insertRest',
      itemId: id,
      description: `Added a rest block on day ${day}`,
      apply: (s) => ({
        ...s,
        items: [
          ...s.items,
          {
            id,
            title: 'Rest',
            type: 'mental',
            kind: 'rest',
            hours: REST_HOURS,
            intensity: 1,
            dayIndex: day,
            startHour: REST_START_HOUR,
            fixed: true,
            deadlineDay: null,
            protectedRest: true,
          },
        ],
      }),
    })
  }

  return moves
}

/**
 * §6.6: sequencing is a lever.
 *
 * Even when the days are fixed, the order within a day is usually free -- and because
 * carryover means a hard session before deep study costs more than the reverse, moving a
 * block after another can improve a week without moving anything off its day. This is
 * what partly answers the degrees-of-freedom problem in §2.5, since no timetable takes
 * ordering away.
 */
function reorderMoves(schedule: Schedule): Move[] {
  const moves: Move[] = []

  for (const item of schedule.items.filter(isMovable)) {
    const sameDay = schedule.items.filter(
      (other) => other.dayIndex === item.dayIndex && other.id !== item.id,
    )

    for (const other of sameDay) {
      const startHour = other.startHour + other.hours
      if (startHour === item.startHour) continue

      moves.push({
        kind: 'reorderWithinDay',
        itemId: item.id,
        description: `Moved ${item.title} to after ${other.title}`,
        apply: (s) => replace(s, item.id, { ...item, startHour }),
      })
    }
  }

  return moves
}

/**
 * §2.1's four neighbour kinds.
 *
 * Invalid results are filtered here rather than scored badly, so the search can never
 * walk through an illegal schedule on its way somewhere better.
 */
export function neighbours(schedule: Schedule, params: EngineParams): Move[] {
  return [
    ...shiftMoves(schedule),
    ...batchMoves(schedule),
    ...restMoves(schedule),
    ...reorderMoves(schedule),
  ].filter((move) => isValid(move.apply(schedule), params))
}
