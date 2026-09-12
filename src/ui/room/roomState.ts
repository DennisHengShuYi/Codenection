import type { BlockRecord } from '../../domain/blockLog'
import { blocksOnDay } from '../../domain/dayBlocks'
import { floorReserve, overallReserve, type ActivityKind, type Projection, type Reserves } from '../../engine'
import type { Schedule } from '../../optimizer'
import { characterStateFor, type CharacterState } from './characterState'
import { dayLoadFor, WAKING_HOURS } from './dayLoad'

export type { CharacterState } from './characterState'

/** §1.3 says one box per pending item -- but a floor with twenty boxes on it is not
 *  readable, and the room's whole job is being readable without being read. */
const MAX_CLUTTER_BOXES = 6

/**
 * What a rested night is, for the bed to draw a shortfall against.
 *
 * Deliberately NOT the engine's `sleepBaselineHours`, and worth saying so, because the two
 * numbers sit one import apart and look like they should match. They answer different
 * questions. The engine's five is where sleep starts *paying reserve back*: §6.1's
 * `max(0, sleep - 5) x k_sleep`, a flow. This seven is where a student is *short*, which is
 * a stock -- and the two coexist without contradiction, since six hours can both leave you
 * a night down and still give something back.
 *
 * Reading the engine's figure here would be the wrong fix rather than the tidy one: at five,
 * a student sleeping five and a half hours would have no visible sleep debt at all, and the
 * bed would stop saying the one thing it is on the wall to say.
 *
 * What is genuinely unfinished: the engine's baseline is a per-student parameter (§7.3's
 * painter was to measure it, and §11 records that nothing does), while this is a population
 * norm and fixed. For a student who needs nine hours the bed under-reports. That wants the
 * same calibration the engine's side is waiting on, not a constant swapped here.
 *
 * Part of that calibration now exists and is deliberately NOT read here. `domain/sleepEnough`
 * learns `EngineParams.enoughSleepHours` -- where sleep stops paying back -- and that is a
 * third question again, not this one: a student can be a night down and still be past the
 * point where more sleep buys them anything. What this constant waits on is where sleep
 * starts paying, which remains unmeasured. The caller already passes `sleepTargetHours` for
 * the student who has stated one, which is the honest answer available today.
 */
const RESTED_NIGHT_HOURS = 7

/** Below this on physical *and* social, getting outside is the highest-value move: it is
 *  the one action that answers both at once (§5.3). */
const DOOR_LIGHTS_BELOW = 25

/** A deficit this close reads as a storm rather than clouds gathering. */
const STORM_WITHIN_DAYS = 7

/**
 * Ruling 45: the hours of one kind that fill its object completely.
 *
 * A cap, for the reason the floor already caps at six boxes: a desk has to be able to look
 * buried without twenty books drawn on it, and the difference between "a heavy day" and "an
 * impossible day" is not something furniture can express -- that is what the spill and the
 * ceiling are for.
 */
const HOURS_TO_FILL_AN_OBJECT = 6

/**
 * The hours of spill that take the room as dark as it goes.
 *
 * Four hours past the end of the day: enough that an evening running long is visible and a
 * genuinely impossible day is unmistakable, without the first half-hour of overrun painting
 * the room black.
 */
const SPILL_AT_DARKEST = 4

export interface ClutterBox {
  readonly id: string
  readonly title: string
  readonly dayIndex: number
}

export interface RoomState {
  /**
   * Ruling 47: 0..1, how much of today is already spoken for -- drawn as a clock face filling.
   *
   * This was the ceiling's job, and the ceiling was the wrong home for it. Its depth is
   * drawn in viewBox units, so it scales with the stage: 13 real pixels on a phone and four
   * times that on a laptop, which is too thin to hold the controls that sit in it and too
   * variable to read as a quantity at all. A clock says the same thing in a shape that
   * means it.
   *
   * Clamped at full, deliberately. A day asking for more hours than it has does not wrap
   * round to empty -- the overflow is the window's to say, and it already does.
   */
  readonly dayFull: number
  /** 0..1. How high the paper has stacked. */
  readonly paperHeight: number
  readonly clutter: readonly ClutterBox[]
  /** Ruling 45: 0..1, exercise still waiting on today -- hard and light together, drawn as a
   *  dumbbell. The engine's split between them is about what they COST, which the reserve
   *  models; the room only says a session is on. */
  readonly exerciseWaiting: number
  /** Ruling 45: 0..1, time with people still waiting on today -- draining and restorative
   *  together, drawn as figures in the room. Same reasoning as exercise: the room says
   *  people are on today, and how that lands is the reserve's business. */
  readonly companyWaiting: number
  /** Hours of sleep owed. */
  readonly sleepDebt: number
  readonly weather: 'clear' | 'clouding' | 'storm'
  /**
   * Ruling 45: 0..1, the overall reserve, for the corner gauge to state as a percentage.
   *
   * Carried explicitly now that the light means the day. The gauge used to derive its
   * number from `lightLevel`, which was the reserve until this ruling rebound it -- and the
   * first run of the new room showed a nine-hour day reading 100% in the corner. That
   * number is the door to the whole breakdown (Ruling 59), so it says the reserve itself.
   */
  readonly reserve: number
  /** Ruling 45: 0..1, dimmed by the hours today cannot fit. Not the reserve -- the corner gauge
   *  carries that, and reads it directly rather than from here. */
  readonly lightLevel: number
  /** Ruling 45: 0..1, how dark the window is, from the same spill. Independent of `weather`,
   *  which stays the forecast. */
  readonly windowDark: number
  readonly doorLit: boolean
  readonly character: CharacterState
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * §1.3's nine bindings, derived from numbers the engine already produces.
 *
 * Every one is a *reflection*. Nothing here is a score, a streak or a target, because
 * §1.3 is explicit that the room is a mirror rather than something a student can succeed
 * or fail at.
 */
export function roomStateFor(
  reserves: Reserves,
  projection: Projection,
  schedule: Schedule,
  /** Ruling 45: which day the furniture draws. */
  today: number,
  /** Ruling 45: what the student has answered, so a block that is done is put away. */
  blockLog: readonly BlockRecord[],
  /**
   * The night the student says they are aiming for, when they have said.
   *
   * What `RESTED_NIGHT_HOURS` below has been waiting for: that constant is a population norm
   * and its own docstring records the consequence -- "for a student who needs nine hours the
   * bed under-reports" -- and that the fix "wants the same calibration the engine's side is
   * waiting on, not a constant swapped here". This is that calibration, stated rather than
   * inferred.
   *
   * Optional, and the fallback is deliberately `RESTED_NIGHT_HOURS` rather than
   * `DEFAULT_SLEEP_HOURS`. Those answer different questions: 8 is the night the app assumes
   * when nobody has told it, 7 is the line below which somebody counts as short. Falling back
   * to 8 would wilt the bed for every student who had never opened the sleep page, which is a
   * claim about them the app has no basis for making.
   */
  sleepTargetHours?: number,
): RoomState {
  const day = dayLoadFor(schedule, today, blockLog)

  /** Hours of one kind, as a 0..1 fullness of the object that carries it. */
  const fullnessOf = (kind: ActivityKind): number =>
    clamp01((day.remainingByKind[kind] ?? 0) / HOURS_TO_FILL_AN_OBJECT)

  // Ruling 45: today's, like everything else in the room. Reading the whole fortnight here left
  // the floor speaking about two weeks while the desk spoke about one day -- one picture
  // answering two questions, which is the fault this ruling exists to fix.
  const pendingErrands = blocksOnDay(schedule, today).filter(
    (item) => item.type === 'errands' && !item.fixed,
  )

  /*
   * Only the nights already behind the student.
   *
   * This averaged the whole fortnight, so the bed reported a debt largely made of the app's
   * own forecast -- and once `assumeSleep` began deriving the nights ahead from a measured
   * average, most of that figure was a prediction rather than a loss. A debt is accrued: a
   * student cannot owe sleep they have not yet failed to get. Short nights AHEAD are a
   * warning, and the window and the forecast are what carry one.
   *
   * Nothing owed on the first morning, because nothing is behind them yet.
   */
  const behind = schedule.sleepByDay.slice(0, Math.max(0, today))

  const averageSleep =
    behind.length === 0
      ? RESTED_NIGHT_HOURS
      : behind.reduce((sum, hours) => sum + hours, 0) / behind.length

  const sleepDebt = Math.max(0, (sleepTargetHours ?? RESTED_NIGHT_HOURS) - averageSleep)

  return {
    // Ruling 47: the same reading, in the object that can actually carry it.
    dayFull: clamp01(day.totalHours / WAKING_HOURS),

    // Ruling 45: the desk stacks with the study still ahead today, rather than with the mental
    // reserve. Answered blocks are put away -- nothing is counted up (§1.3).
    paperHeight: fullnessOf('studyBlock'),

    clutter: pendingErrands.slice(0, MAX_CLUTTER_BOXES).map((item) => ({
      id: item.id,
      title: item.title,
      dayIndex: item.dayIndex,
    })),

    // Ruling 45: both exercise kinds fill one object, and both kinds of company fill another.
    // `rest` deliberately has no object at all -- it is the one thing on a day that is not
    // a duty the student owes anyone, and drawing it as another thing waiting to be done
    // would turn the one restorative item on the day into another obligation.
    exerciseWaiting: clamp01(fullnessOf('hardExercise') + fullnessOf('lightExercise')),
    companyWaiting: clamp01(fullnessOf('socialDraining') + fullnessOf('socialRestorative')),
    sleepDebt,

    weather:
      projection.firstDeficitDay === null
        ? 'clear'
        : projection.firstDeficitDay <= STORM_WITHIN_DAYS
          ? 'storm'
          : 'clouding',

    reserve: clamp01(overallReserve(reserves) / 100),

    /**
     * Ruling 45: the light is the day's, not the reserve's.
     *
     * A day whose hours do not fit inside its waking hours has to take the difference out
     * of sleep, and this says so BEFORE the night rather than after it -- the last point at
     * which the student can still move something. The corner gauge reads the reserve
     * directly and no longer derives it from here, or its number would mean a mix of two
     * things (Ruling 59 made that gauge the door to the whole breakdown).
     */
    lightLevel: clamp01(1 - day.spillHours / SPILL_AT_DARKEST),

    /** Ruling 45: the same spill, as the window's darkness. Independent of `weather`, which is
     *  the forecast: a dark clear window is an exhausted student with a calm week ahead. */
    windowDark: clamp01(day.spillHours / SPILL_AT_DARKEST),

    // Both, not either. Going outside is the single action that answers physical and
    // social at once, and that is what makes it the highest-value move rather than
    // simply a good one.
    doorLit: reserves.physical < DOOR_LIGHTS_BELOW && reserves.social < DOOR_LIGHTS_BELOW,

    character: characterStateFor(floorReserve(reserves)),
  }
}
