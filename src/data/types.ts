import type { BlockRecord } from '../domain/blockLog'
import type { CalibrationProfile } from '../domain/calibration'
import { DEFAULT_PROFILE } from '../domain/calibration'
import type { Ladder } from '../domain/ladder'
import type { SleepNight } from '../domain/sleepLog'
import type { Schedule } from '../optimizer'

/** §1.5's low-energy mode is a product decision as much as an accessibility one, so the
 *  student can force it either way rather than only having it inferred for them. */
export interface StoredSettings {
  readonly lowEnergyOverride: 'auto' | 'on' | 'off'
  /**
   * §7's calibration profile.
   *
   * Kept here rather than in a storage concept of its own: both adapters already persist
   * settings as one blob, so this needs no migration and no adapter change. Optional
   * because settings saved before calibration existed have no such field and must keep
   * loading.
   */
  readonly calibration?: CalibrationProfile
  /**
   * §4.1's chains, one per block that has been opened on the micro-start page.
   *
   * Here rather than behind new `Repository` methods for the same reason `calibration` is:
   * both adapters already persist settings as one blob, so this needs no migration and no
   * adapter change. Optional, because settings saved before the ladder existed have no such
   * field and must keep loading.
   *
   * A ladder is dropped when its block is completed or removed, so a record cannot outlive
   * the thing it describes.
   */
  readonly ladders?: readonly Ladder[]
  /**
   * The night the student says they are aiming for.
   *
   * A durable preference rather than a per-fortnight value: it has to survive the fortnight
   * rolling over, which `Schedule.sleepByDay` does not. Here rather than behind new
   * `Repository` methods for the reason `calibration` and `ladders` are -- one blob, no
   * migration, no adapter change.
   *
   * Ruling 64: a *guess*, not a promise. `optimizer/gaps.DAY_END_HOUR` is untouched, so the solver may
   * still place work past midnight; what this changes is what the app assumes and what it
   * warns about, never what it is allowed to schedule. A hard wall would have made a crunch
   * fortnight genuinely unsolvable.
   *
   * Optional, and with no entry in `DEFAULT_SETTINGS` on purpose: absent means "never
   * stated", which `domain/sleepReality` and `ui/room/roomState` both read differently from a
   * stated figure. A default here would make every student look as though they had set one.
   */
  readonly sleepTargetHours?: number
  /**
   * §8's answered nights, durable at last -- see `domain/sleepLog`.
   *
   * Before this, whether a night had been answered lived only in `RoomShell`'s React state,
   * so the app re-asked after every reload and nothing could tell a reported figure from the
   * default sitting in its place.
   */
  readonly sleepNights?: readonly SleepNight[]
  /**
   * Hours the student chose for the night that BEGAN on each date.
   *
   * Separate from `Schedule.sleepByDay` because that field holds what the app *assumes*, and
   * one field cannot be both: the page could either show a student their own figure or let
   * the projection reason from an honest one, never both. `domain/sleepAssumed` derives the
   * second from this and the reported log.
   *
   * Keyed by date rather than day index, for `sleepNights`' reason: a fortnight rolls over,
   * and an index would silently come to describe a different night. Entries age out of
   * relevance on their own -- once a night is past, what was reported about it is what counts.
   */
  readonly sleepChosenByDate?: Readonly<Record<string, number>>
  /**
   * The clock hour the student gets up.
   *
   * Stored instead of a bedtime because the morning is the fixed end of a night -- somebody
   * gets up for a nine o'clock class whatever time they got to bed -- so bedtime is what
   * moves when a day runs long. `domain/nightWindow` counts back from this.
   *
   * A drawing only. Sleep is deliberately not a block on the grid (`engine/types.ts` records
   * that a sleep block would be double-counted), so this changes no figure the model reads.
   */
  readonly sleepWakeHour?: number
}

export const DEFAULT_SETTINGS: StoredSettings = {
  lowEnergyOverride: 'auto',
  calibration: DEFAULT_PROFILE,
}

/**
 * The only persistence vocabulary the app knows.
 *
 * Two adapters implement it and the choice is made once at startup, so no screen ever
 * learns whether it is talking to IndexedDB or Supabase. That is what lets CI run green
 * with no secrets configured, and what keeps the demo alive if the network dies on stage.
 */
export interface Repository {
  loadWeek(): Promise<Schedule | null>
  saveWeek(week: Schedule): Promise<void>
  loadSettings(): Promise<StoredSettings>
  saveSettings(settings: StoredSettings): Promise<void>
  /**
   * §8b's durable record of what was scheduled and what became of it.
   *
   * Sits behind the repository rather than only in Supabase, because the app works signed
   * out and Reality Check must not silently stop working for anyone without an account.
   */
  /**
   * Every answer this account has given, oldest first.
   *
   * The order is part of the contract now rather than an accident of the adapter. It was
   * unstated, and the two implementations disagreed: the local one returns insertion order,
   * while the Supabase read had no `order` clause and PostgREST promises nothing without
   * one. Every consumer today is order-independent (`outcomesFrom` and `checkedInDays` both
   * are), which is why two adapters answering differently would have gone unnoticed until
   * one was not.
   */
  loadBlockLog(): Promise<readonly BlockRecord[]>
  /** Upserts on `blockId`: answering the same block twice corrects the first answer
   *  rather than stacking a second one. */
  recordBlockAnswer(record: BlockRecord): Promise<void>
  clear(): Promise<void>
}
