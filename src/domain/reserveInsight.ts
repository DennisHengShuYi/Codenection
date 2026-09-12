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
import { answeredIds, type BlockRecord } from './blockLog'
import { describeDeficit, explainDeficit } from './deficitCause'
/* `RESTORES` and the window live in `prescribe` now. Both files need them, and one shared
   definition of "already covered" is what keeps this sheet from contradicting itself between
   the line naming a booked event and the advice underneath it. */
import { COVERED_WITHIN_DAYS, firstUncovered, prescribe, RESTORES } from './prescribe'

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

export interface UpcomingRelief {
  readonly title: string
  readonly dayIndex: number
}

export interface ReserveInsight {
  /** All four, thinnest first: the limiting one has to be read first. */
  readonly notes: readonly ReserveNote[]
  readonly deficit: InsightDeficit | null
  /**
   * What is already on the calendar for the thinnest reserve, soonest first, or null.
   *
   * The block read as broken without this and was not: People at 43 with nothing said about
   * people, because seeing someone was booked for tomorrow and the app had therefore stopped
   * counting it as neglected -- correctly, and silently. The silence is what made it look
   * wrong. A student cannot tell "we have nothing to say about your lowest reserve" from "it
   * is already handled, and here is what to do until then".
   */
  readonly upcoming: UpcomingRelief | null
  /** §5.2's one concrete action, where today has room for one. */
  readonly action: { readonly title: string; readonly hours: number } | null
  /**
   * Why there is no action, when there is none.
   *
   * `prescribe` returns a bare null and says in writing that it does not distinguish its two
   * causes, because for its caller either way there is one honest answer and it is not a
   * suggestion. Here the difference is the entire message: "everything your reserves need is
   * already on the plan" is the app working and worth hearing, and "there is no free stretch
   * on today" is a different fact a student would act differently on. Told apart here rather
   * than there, so that function keeps the shape its own docstring argues for.
   */
  readonly noAction: 'allInHand' | 'noRoomToday' | null
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

  /*
   * Unanswered, from today onward, and inside the window the advice itself counts.
   *
   * A block the student has already reported on is history whatever day it sits on, and a day
   * behind them cannot be what is coming. The far edge is `prescribe`'s, deliberately shared:
   * this line and the advice under it must agree about what "already covered" means, or the
   * sheet names a coffee twelve days out as answering the reserve in one sentence and tells
   * the student to go and message somebody in the next.
   */
  const answered = new Set(answeredIds(blockLog))
  const thinnest = notes[0]?.type

  const upcoming =
    thinnest === undefined
      ? null
      : (schedule.items
          .filter(
            (candidate) =>
              candidate.dayIndex >= today &&
              candidate.dayIndex <= today + COVERED_WITHIN_DAYS &&
              !answered.has(candidate.id) &&
              RESTORES[thinnest].includes(candidate.kind),
          )
          .sort((a, b) => a.dayIndex - b.dayIndex || a.startHour - b.startHour)[0] ?? null)

  /*
   * Which of the two silences this is.
   *
   * `prescribe` returning nothing means one of two quite different things, and a student acts
   * differently on each: either every reserve it can speak for is already covered -- the plan
   * working -- or something still needs answering and today has no free stretch to put it in,
   * which asks them to move something rather than add something.
   *
   * Read from the same `firstUncovered` the prescription itself walks, so the two can never
   * disagree about which case this is. It used to be read from the overdue rhythm list, which
   * stopped being what decides the advice.
   */
  const uncovered = firstUncovered(schedule, today, blockLog, reserves)

  return {
    notes,
    noAction:
      prescription !== null ? null : uncovered === null ? 'allInHand' : 'noRoomToday',
    upcoming:
      upcoming === null ? null : { title: upcoming.title, dayIndex: upcoming.dayIndex },
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
    dayNameFor,
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
    /**
     * A day as a student would say it -- "today", "tomorrow", "Thursday".
     *
     * Supplied for the reason `deficitDayLabel` is: naming a day needs the week's anchor and
     * `today`, and a bare index is the model's own counting, off by one in the student's
     * terms besides.
     */
    readonly dayNameFor: (dayIndex: number) => string
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

  /*
   * What is already booked for the thinnest reserve, before the suggestion.
   *
   * Without this the block looked broken and was not: People at 43, and a suggestion about
   * resting, because seeing someone was on the calendar for tomorrow and the app had
   * therefore stopped counting it as neglected. That is right, and saying nothing about it
   * is what made it read as the app ignoring its own headline. Named, the same two lines
   * become an argument a student can follow: this is handled, so here is the next thing.
   */
  if (insight.upcoming !== null) {
    lines.push(
      `${insight.upcoming.title} ${dayNameFor(insight.upcoming.dayIndex)} is what answers that, so it is already in hand.`,
    )
  }

  if (insight.noAction === 'allInHand') {
    lines.push(
      'Everything your reserves need is already on the plan, so there is nothing to add today.',
    )
  }

  if (insight.noAction === 'noRoomToday') {
    // Not the same news, and not the same response. The first is the plan working; this is
    // a day with no gap left in it, and what it asks for is moving something rather than
    // adding something.
    lines.push('There is no free stretch on today to put anything else in.')
  }

  if (insight.action !== null) {
    // Reworded where something is already booked, because "worth doing" beside a suggestion
    // for a different reserve reads as the app having forgotten the line above it.
    const lead = insight.upcoming === null ? 'Worth doing' : 'Until then, worth doing'

    lines.push(
      `${lead}: ${insight.action.title.toLowerCase()} — today has about ${insight.action.hours}h free for it.`,
    )
  }

  return lines
}
