import { answeredIds, checkedInDays, outcomesFrom, type BlockRecord } from '../../domain/blockLog'
import type { CalibrationProfile } from '../../domain/calibration'
import { lapsed } from '../../domain/commitments'
import { dateFor } from '../../domain/calendar'
import { paramsFor } from '../../domain/engineParams'
import { isStuck } from '../../domain/microStart'
import { project } from '../../engine'
import { toDayInputs, type Schedule } from '../../optimizer'
import {
  CLUTTER_PLACEHOLDER,
  clutterIdFor,
  isClutterId,
  metaFor,
  OBJECT_ORDER,
  type ObjectId,
} from './objects'
import { roomStateFor, type RoomState } from './roomState'

export interface RoomModelInput {
  readonly schedule: Schedule
  readonly profile: CalibrationProfile
  /** Injected rather than read, so this stays pure. The shell supplies it. */
  readonly today: number
  /**
   * §8b's durable record of what was scheduled and what became of it. Threaded in rather
   * than loaded here, so this stays pure -- the shell reads it from the repository and
   * supplies it. Optional and defaulting to empty so every caller built before this
   * existed keeps compiling and behaving exactly as it did.
   */
  readonly blockLog?: readonly BlockRecord[]
}

export interface RoomRow {
  readonly id: ObjectId
  readonly label: string
  /** What this object currently reads, so the list says something before anything is tapped
   *  -- and so the plant and the light are not dead ends. */
  readonly reading: string
  readonly attention: boolean
}

export interface RoomModel {
  readonly state: RoomState
  readonly rows: readonly RoomRow[]
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

/**
 * One model for both presentations.
 *
 * The room and the sidebar are the same thing drawn two ways, so they are derived here
 * together rather than by two functions that agree by convention. Attention is computed on
 * every call and never stored, so no flag can get stuck showing a problem that has passed.
 */
export function roomModel({ schedule, profile, today, blockLog = [] }: RoomModelInput): RoomModel {
  // §8b/Task 17: the durable log is the only source now. It used to be unioned with the
  // profile's own `confirmations` because nothing wrote a `BlockRecord` in the running app
  // yet -- `TodayCard` and the Telegram bot both do now, so the profile side is gone.
  const params = paramsFor(outcomesFrom(blockLog))
  // §8b/Ruling 11 amended: a past day carrying no answer is a day the student went quiet,
  // and the model should get more worried, not pretend it heard from them. Days from
  // `today` onward stay checked in -- there is nothing to check in about yet -- which is
  // `checkedInDays`'s own guarantee, not re-derived here.
  const checkedIn = checkedInDays(blockLog, today, schedule.horizonDays)
  const projection = project(schedule.start, toDayInputs(schedule, checkedIn), params)
  const state = roomStateFor(schedule.start, projection, schedule)

  // §7 made recovery a single room-screen card rather than furniture-routed advice, so this
  // model no longer decides whether a prescription belongs to the bed, the door or the
  // phone -- `RoomShell` reads `prescribe` directly for the card, and none of the three rows
  // below light up for it any more.
  const lapsedNow = lapsed(schedule, today, params, blockLog)

  // §8b/Task 17: the durable log is the only record of what has already been asked about.
  const alreadyAsked = (id: string) => answeredIds(blockLog).includes(id)
  const unconfirmed = schedule.items.find(
    (candidate) => candidate.dayIndex === today && !alreadyAsked(candidate.id),
  )

  // From the injected day index, not from a clock. Reading `new Date()` here would make the
  // model impure; passing `new Date(0)` -- which I did first -- resolves to 1970 and silently
  // matches nothing.
  const todayDate = dateFor(schedule, today)
  const unscored = profile.predictions.some(
    (prediction) => prediction.forDate === todayDate && prediction.reported === null,
  )

  const rowsFor = (id: ObjectId): RoomRow[] => {
    const { label } = metaFor(id)

    switch (id) {
      case 'desk':
        return [{ id, label, reading: `${schedule.items.length} things in the week`, attention: false }]
      case 'door':
        return [
          {
            id,
            label,
            reading: state.doorLit ? 'lit' : 'quiet',
            attention: state.doorLit,
          },
        ]
      case 'papers':
        return [
          {
            id,
            label,
            reading: unconfirmed ? unconfirmed.title : 'nothing to confirm',
            attention: unconfirmed !== undefined,
          },
        ]
      case 'bed':
        return [
          {
            id,
            label,
            reading: `${Math.round(state.sleepDebt * 10) / 10}h owed`,
            attention: false,
          },
        ]
      case 'phone':
        return [
          {
            id,
            label,
            reading: lapsedNow.length > 0 ? `${lapsedNow.length} lapsed` : 'nothing waiting',
            attention: lapsedNow.length > 0,
          },
        ]
      case 'character':
        return [
          {
            id,
            label,
            reading: state.character.replace(/([A-Z])/g, ' $1').toLowerCase().trim(),
            attention: unscored,
          },
        ]
      // Task 17: the mirror used to report a "% tuned" figure fed by `calibrationProgress`,
      // which fed only its own progress bar and nothing else. Deleted along with the rest
      // of the calibration subsystem -- the mirror now falls through to `default` and
      // renders no row, rather than a reading about a screen nothing routes to any more.
      case 'ceiling':
        return [
          {
            id,
            label,
            reading: `${percent(state.ceilingPressure)} down`,
            attention: projection.deficitDays > 0,
          },
        ]
      case 'window':
        return [{ id, label, reading: state.weather, attention: false }]
      case 'plant':
        return [{ id, label, reading: percent(state.plantHealth), attention: false }]
      case 'light':
        return [{ id, label, reading: percent(state.lightLevel), attention: false }]
      default:
        return []
    }
  }

  const rows = OBJECT_ORDER.flatMap((entry) => {
    if (entry !== CLUTTER_PLACEHOLDER) return rowsFor(entry as ObjectId)

    // One row per box, expanded in place so the fixed order still holds.
    return state.clutter.map((box): RoomRow => {
      const id = clutterIdFor(box.id)
      const stuck = isStuck(
        schedule.items.find((candidate) => candidate.id === box.id) ?? {
          ...box,
          type: 'errands',
          kind: 'errands',
          hours: 1,
          intensity: 1,
          startHour: 12,
          fixed: false,
          deadlineDay: null,
          protectedRest: false,
        },
        Math.max(0, box.dayIndex - today),
      )

      return { id, label: box.title, reading: `day ${box.dayIndex}`, attention: stuck }
    })
  })

  return { state, rows }
}
