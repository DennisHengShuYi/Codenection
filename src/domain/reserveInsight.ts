import {
  DEFICIT_THRESHOLD,
  efficiencyAt,
  floorReserve,
  LOAD_TYPES,
  type DayInput,
  type EngineParams,
  type LoadType,
  type Projection,
  type Reserves,
} from '../engine'
import type { Schedule } from '../optimizer'
import type { BlockRecord } from './blockLog'
import { describeDeficit, explainDeficit } from './deficitCause'
import { prescribe } from './prescribe'

/**
 * Above this a reserve is not what limits anybody, and saying so is noise.
 *
 * The sheet already draws all four bars with their numbers on them, so a line repeating
 * "Body & movement: 100" earns nothing -- §1.5's text equivalent directly above is the
 * complete readout, and this block exists to say the part that readout cannot.
 */
const WORTH_COMMENTING_BELOW = 70

/** How many of a deficit's drains are worth naming. Past two it stops being a cause and
 *  becomes a list. */
const SOURCES_NAMED = 2

export interface ReserveNote {
  readonly type: LoadType
  /** Where today started, which is what every reading on this sheet is about. */
  readonly level: number
  /**
   * §6.2's curve read at that level: the share of an hour's rest this reserve pays back.
   *
   * The mechanic the whole app exists to make visible, and the one thing the dial cannot
   * draw. A student reading "43" has no way to know the same hour of rest buys them less
   * there than at 80, and that difference is what turns a bad week into a spiral.
   */
  readonly payback: number
  /** §2.1: burnout is a floor problem, so exactly one reserve is the one that matters. */
  readonly lowest: boolean
}

export interface InsightDeficit {
  readonly type: LoadType
  readonly dayIndex: number
  readonly level: number
  /** In the student's words, biggest first, and only what this reserve actually paid for. */
  readonly sources: readonly string[]
  readonly shortNights: number
  /** `describeDeficit`'s own sentence, so the sheet and the week grid cannot give one
   *  student two different accounts of the same crossing. */
  readonly why: string
}

export interface ReserveInsight {
  /** All four, thinnest first: the limiting one has to be read first. */
  readonly notes: readonly ReserveNote[]
  readonly deficit: InsightDeficit | null
  /** §5.2's one concrete action, where today has room for one. */
  readonly action: { readonly title: string; readonly hours: number } | null
}

/**
 * What the Reserves sheet can say beyond reading its own dial back.
 *
 * The sheet showed four numbers, a projection bar and a restatement of all of them, and
 * nothing that told a student what any of it meant for them. Everything here is derived
 * from the projection that produced those numbers -- §8.2 forbids the app describing a week
 * the model did not simulate, and that rule is why the language model above this may only
 * rephrase these lines rather than write its own.
 *
 * Pure, and it recomputes nothing the caller has already done: the days, the projection and
 * the params come in, because the caller holds them and a second derivation is a second
 * chance for the screen to disagree with itself.
 */
export function reserveInsight({
  schedule,
  reserves,
  today,
  blockLog,
  days,
  projection,
  params,
}: {
  readonly schedule: Schedule
  /**
   * The reserve entering today -- what every other reading on this sheet is about.
   *
   * Passed in rather than taken from `schedule.start`, and the difference is not cosmetic.
   * `schedule.start` is where the FORTNIGHT opened; the bars, the headline and the room's
   * gauge all quote the reserve entering TODAY. Reading the opening figures here had the
   * block calling all four "your thinnest, at 70" on a week whose mental reserve had
   * actually fallen to 37 -- one sheet giving one student two accounts of themselves, which
   * is the fault `RoomShell.reserves.test.tsx` was already written to catch one layer up.
   */
  readonly reserves: Reserves
  readonly today: number
  readonly blockLog: readonly BlockRecord[]
  readonly days: readonly DayInput[]
  readonly projection: Projection
  readonly params: EngineParams
}): ReserveInsight {
  const floor = floorReserve(reserves)

  // Exactly one, even in a tie. Four reserves all sitting at 70 are all equal to the floor,
  // and flagging each of them had the block say "your thinnest" four times about four
  // different things. Sorted first, so the one flagged is the one read first.
  const notes: ReserveNote[] = LOAD_TYPES.map((type) => ({
    type,
    level: reserves[type],
    payback: efficiencyAt(reserves[type]),
    lowest: false,
  }))
    .sort((a, b) => a.level - b.level)
    .map((note, index) => ({ ...note, lowest: index === 0 && note.level === floor }))

  const cause =
    projection.firstDeficitDay === null
      ? null
      : explainDeficit({
          start: schedule.start,
          days,
          projection,
          params,
          dayIndex: projection.firstDeficitDay,
        })

  /*
   * The reserve entering today is handed on, so the action answers the reserve this block
   * has just named. Without it the two disagreed on screen -- "People is your thinnest, at
   * 43" above "Worth doing: stop and do nothing" -- because `prescribe` ordered by how long
   * a rhythm had gone unkept and nothing else. It is a tie-break there, never a source: a
   * thin reserve still cannot conjure advice for a rhythm that is being kept.
   */
  const prescription = prescribe(schedule, today, blockLog, reserves)

  return {
    notes,
    deficit:
      cause === null || projection.firstDeficitDay === null
        ? null
        : {
            type: cause.type,
            dayIndex: projection.firstDeficitDay,
            level: cause.level,
            sources: cause.sources.slice(0, SOURCES_NAMED).map((source) => source.source),
            shortNights: cause.shortNights,
            why: describeDeficit(cause),
          },
    action:
      prescription === null
        ? null
        : { title: prescription.title, hours: prescription.hours },
  }
}

/** `payback` as the percentage a student would say. */
const pct = (share: number): number => Math.round(share * 100)

/**
 * The wording -- which is also the exact set of facts the model above may rephrase.
 *
 * Kept in the domain rather than the component because it is the fallback as well as the
 * brief. With no `GROQ_API_KEY` -- CI, the tests, and `vite dev` where /api is not served at
 * all -- these lines are what the student reads, so they have to stand on their own rather
 * than read as an apology for a missing model.
 */
export function insightLines(
  insight: ReserveInsight,
  {
    deficitDayLabel,
    labelFor,
  }: {
    /**
     * The crossing day as a student would say it, or null.
     *
     * Passed in for the reason `describeDial` takes it: naming a day needs the week's anchor
     * and `today`, and a bare index is the model's own counting -- off by one in the
     * student's terms besides.
     */
    readonly deficitDayLabel: string | null
    /**
     * What to call each reserve, supplied by the screen showing it.
     *
     * Not `IN_THEIR_WORDS`, which is this module's near neighbour and would have been the
     * obvious import. That vocabulary says "study and writing"; the bars three lines above
     * this block say "Study & thinking". One sheet, one reserve, two names for it -- the
     * exact fault `ui/kit/labels.ts` exists to prevent and `WeekScreen` records having hit.
     * So the caller passes the names it is already drawing.
     */
    readonly labelFor: (type: LoadType) => string
  },
): readonly string[] {
  const lines: string[] = []

  const limiting = insight.notes.filter(
    (note) => note.lowest || note.level < WORTH_COMMENTING_BELOW,
  )

  for (const note of limiting) {
    const name = labelFor(note.type)
    const where = note.lowest ? `${name} is your thinnest, at ${Math.round(note.level)}` : `${name} is at ${Math.round(note.level)}`

    lines.push(
      note.payback >= 1
        ? `${where}, and rest there pays back in full.`
        : `${where} — at that level an hour of rest gives back about ${pct(note.payback)}% of what it would at full.`,
    )
  }

  if (insight.deficit !== null) {
    lines.push(
      deficitDayLabel === null
        ? `On this plan you cross into deficit before the fortnight is out. ${insight.deficit.why}`
        : `On this plan you cross into deficit on ${deficitDayLabel}. ${insight.deficit.why}`,
    )
  } else {
    // Said out loud rather than left as silence. A block that only ever speaks when
    // something is wrong teaches a student to read its presence as bad news, which is the
    // opposite of §1.3's mirror.
    lines.push(
      `Nothing in the next fortnight takes you below ${DEFICIT_THRESHOLD}, where one empty reserve starts pulling the others down.`,
    )
  }

  if (insight.action !== null) {
    lines.push(
      `Worth doing: ${insight.action.title.toLowerCase()} — today has about ${insight.action.hours}h free for it.`,
    )
  }

  return lines
}
