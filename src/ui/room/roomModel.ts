import { answeredIds, outcomesFrom, type BlockRecord } from '../../domain/blockLog'
import { calibrationProgress, type CalibrationProfile } from '../../domain/calibration'
import { lapsed } from '../../domain/commitments'
import { dateFor } from '../../domain/calendar'
import { paramsFor } from '../../domain/engineParams'
import { isStuck } from '../../domain/microStart'
import { prescribe } from '../../domain/prescribe'
import { attemptsIn } from '../../domain/recoveryLog'
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
  // §8b: outcomes come from the durable log and from the profile's own (soon-to-be-retired)
  // record, combined. Reading the log alone would silently drop every bias measured through
  // the profile the moment this shipped, with nothing yet writing its replacement into the
  // log (Task 9 does that) -- the room's own projection would go uncalibrated while the
  // dial elsewhere in the app kept using it. Combining keeps this byte-for-byte identical
  // to before while the log is still empty in practice.
  const params = paramsFor([...outcomesFrom(blockLog), ...profile.confirmations])
  const projection = project(schedule.start, toDayInputs(schedule), params)
  const state = roomStateFor(schedule.start, projection, schedule)

  const prescription = prescribe(schedule, attemptsIn(schedule))

  /**
   * Which object a prescription belongs to.
   *
   * §5.2 matches the advice to the depleted type, so the *furniture* has to match it too --
   * otherwise a social prescription marks nothing and the student is told to see somebody by
   * an app that shows them nowhere to do it. Rest is the bed, movement is the door, and
   * seeing people is the phone, because that is where reaching somebody starts.
   */
  const prescribedOn =
    prescription === null
      ? null
      : prescription.kind === 'rest'
        ? 'bed'
        : prescription.kind === 'socialRestorative'
          ? 'phone'
          : 'door'
  const lapsedNow = lapsed(schedule, today, params)

  // §8b: a block counts as already asked about if the durable log says so, or if the
  // profile's own (soon-to-be-retired) record of it does. Only the log side is new; the
  // profile side stays until the confirmation flow itself writes to the log instead (Task
  // 9) and the calibration subsystem that owns the field is removed (a later task still).
  // Dropping it here today would read as though every already-confirmed block had gone
  // back to being unconfirmed, which is not what happened.
  const alreadyAsked = (id: string) =>
    answeredIds(blockLog).includes(id) || profile.confirmedItemIds.includes(id)
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
            attention: state.doorLit || prescribedOn === 'door',
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
            attention: prescribedOn === 'bed',
          },
        ]
      case 'phone':
        return [
          {
            id,
            label,
            reading: lapsedNow.length > 0 ? `${lapsedNow.length} lapsed` : 'nothing waiting',
            attention: lapsedNow.length > 0 || prescribedOn === 'phone',
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
      case 'mirror': {
        const tuned = Math.round(calibrationProgress(profile) * 100)
        return [{ id, label, reading: `${tuned}% tuned`, attention: tuned < 50 }]
      }
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
        0,
        Math.max(0, box.dayIndex - today),
      )

      return { id, label: box.title, reading: `day ${box.dayIndex}`, attention: stuck }
    })
  })

  return { state, rows }
}
