import { checkedInDays, outcomesFrom, type BlockRecord } from '../../domain/blockLog'
import { paramsFor } from '../../domain/engineParams'
import type { EnergyPrediction } from '../../domain/predictions'
import type { SleepNight } from '../../domain/sleepLog'
import { project, type Reserves } from '../../engine'
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
  /**
   * §8.1's resolved predictions, from which the recovery coefficients are learned.
   *
   * Required for Ruling 51's reason, which applies here word for word: a call site that
   * forgets these compiles, looks reasonable, and quietly draws the room from population
   * coefficients while the today card scores itself against learned ones. A caller with no
   * predictions says `[]` in its own words.
   */
  readonly predictions: readonly EnergyPrediction[]
  /**
   * The night the student says they are aiming for, when they have said.
   *
   * Optional, and this is the one threaded value on this input where Ruling 51's argument
   * does NOT bite. That ruling made `blockLog` and `predictions` required because a caller
   * who forgets them compiles and then quietly prices the week as though the student had
   * answered nothing -- a wrong reading dressed as a real one. Absent here is not a wrong
   * reading: it is the true state of a student who has never stated a target, and
   * `roomState` falls back to the population norm, which is exactly what that student should
   * see.
   *
   * What it does cost: `ui/request/RequestBoxScreen` draws a room preview and does not pass
   * this, so a student who HAS stated a target sees the bed measured against it on the room
   * screen and against the norm in that preview. Recorded here rather than left to be found,
   * and it wants the target threaded there rather than this made required.
   */
  readonly sleepTargetHours?: number
  /**
   * §8b's reported nights, for how much sleep is enough for this student.
   *
   * Threaded for `predictions`' stated reason and not a new one: left out, the room is drawn
   * from population coefficients while the sleep page quotes a learned figure, and two
   * surfaces describe one fortnight differently. Optional and defaulting to empty, so every
   * caller written before this keeps behaving exactly as it did -- `enoughSleepFor` returns
   * the population figure on no evidence.
   */
  readonly nights?: readonly SleepNight[]
}

export interface RoomModel {
  readonly state: RoomState
  /**
   * The reserve the student has *entering today*, which is what every "where am I now"
   * reading on the room screen must agree about.
   *
   * Returned rather than left for the shell to work out again. `RoomShell` needs the same
   * figure three times -- the corner gauge, the Reserves sheet's headline, and the floor
   * that decides §1.5's low-energy mode -- and each was deriving it from `schedule.start`
   * on its own. Three derivations of one number is three chances for the screen to
   * disagree with itself; this makes it one.
   */
  readonly reserves: Reserves
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
export function roomModel({
  schedule,
  today,
  blockLog,
  predictions,
  sleepTargetHours,
  nights = [],
}: RoomModelInput): RoomModel {
  // §8b/Task 17: the durable log is the only source now. It used to be unioned with the
  // profile's own `confirmations` because nothing wrote a `BlockRecord` in the running app
  // yet -- `TodayCard` and the Telegram bot both do now, so the profile side is gone.
  // Threaded so the drawing runs the same model the prediction loop does. Left out, the
  // room would be lit by population coefficients while the today card scored itself against
  // learned ones -- two surfaces describing the same fortnight differently.
  const params = paramsFor(outcomesFrom(blockLog), predictions, nights)
  // §8b/Ruling 11 amended: a past day carrying no answer is a day the student went quiet,
  // and the model should get more worried, not pretend it heard from them. Days from
  // `today` onward stay checked in -- there is nothing to check in about yet -- which is
  // `checkedInDays`'s own guarantee, not re-derived here.
  const checkedIn = checkedInDays(blockLog, today, schedule.horizonDays)
  const projection = project(schedule.start, toDayInputs(schedule, checkedIn), params)

  /**
   * Where the student is now, rather than where the fortnight began.
   *
   * This was `schedule.start`, which is day zero and never moves -- so on day ten of a
   * heavy week the gauge, the character and the door all still reported the number the week
   * opened with, while the week grid beside them read each day off this same projection.
   * `restNow.ts` had already refused a `.start`-derived headline for the reason: it "would
   * read the same before and after, which is worse than no headline".
   *
   * Entering today, not leaving it. `project` pushes each day after its tick, so
   * `central[today - 1]` is what the student has when today starts and has not yet lived
   * it -- which is the honest reading for a gauge somebody checks in the morning. Day zero
   * has no prior day, and `schedule.start` is its entering value by definition.
   */
  const entering =
    today <= 0 ? schedule.start : (projection.central[today - 1] ?? schedule.start)

  return {
    state: roomStateFor(entering, projection, schedule, today, blockLog, sleepTargetHours),
    reserves: entering,
  }
}
