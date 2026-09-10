import { checkedInDays, outcomesFrom, type BlockRecord } from '../../domain/blockLog'
import { paramsFor } from '../../domain/engineParams'
import { project } from '../../engine'
import { toDayInputs, type Schedule } from '../../optimizer'
import { roomStateFor, type RoomState } from './roomState'

export interface RoomModelInput {
  readonly schedule: Schedule
  /** Injected rather than read, so this stays pure. The shell supplies it. */
  readonly today: number
  /**
   * §8b's durable record of what was scheduled and what became of it. Threaded in rather
   * than loaded here, so this stays pure -- the shell reads it from the repository and
   * supplies it.
   *
   * Ruling 51: required, not optional-with-default. It was defaulted to `[]` so callers
   * written before the log existed kept compiling, and that convenience is the exact
   * mechanism Rulings 39 and 41 removed on either side of this one -- a call site that
   * forgets the log compiles, looks reasonable, and quietly prices the week as though the
   * student had answered nothing. A caller with no log must now say `[]` in its own words.
   */
  readonly blockLog: readonly BlockRecord[]
}

export interface RoomModel {
  readonly state: RoomState
}

/**
 * The week, as the room draws it.
 *
 * This used to derive a second presentation alongside the drawing -- a `rows` list of one
 * entry per object, with a reading and an attention flag, for `RoomSidebar` to render as
 * text. §3 replaced that sidebar with a permanent paragraph on the room screen and a week
 * screen that is already words, so nothing read `rows` any more; Task 17's review recorded
 * it as dead weight rather than a lost binding, because `Room` destructures only `state`
 * and all nine of §1.3's bindings come from `roomStateFor`. It is deleted here, and the
 * cascade with it: `objects.ts`'s labels and traversal order described a room you could
 * tap, and nothing has been tappable since 74dccd4.
 *
 * What the rows computed beyond `state` is all still computed -- by the code that actually
 * shows it. `RoomShell` calls `lapsed` for the lapsed card and `isStuck` for the micro-start
 * card; `checkIn.blockToAsk` and `scheduleView` decide which blocks are unanswered; the
 * energy question comes from the same `predictions` scan the character row used. None of
 * that ran through here.
 *
 * The `profile` input went the same way. Its only reader was the character row's "is there
 * a prediction still to score" flag -- which is why `RequestBoxScreen` was passing
 * `DEFAULT_PROFILE` to a model that never looked at it.
 */
export function roomModel({ schedule, today, blockLog }: RoomModelInput): RoomModel {
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

  return { state: roomStateFor(schedule.start, projection, schedule) }
}
