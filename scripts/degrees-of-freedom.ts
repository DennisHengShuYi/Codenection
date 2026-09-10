/**
 * §2.5's week-one validation task. Run this BEFORE any rebalance UI is built.
 *
 * The question: for a typical UM final-year student, how much can the optimizer actually
 * move? A final-year timetable is mostly fixed -- lectures, labs, a supervisor meeting,
 * two weekend shifts -- so the movable set may be small.
 *
 * If rebalance returns "moved one thing by a day", then §2.2's smallest-fix search,
 * §6.6's within-day reordering and §5.1's rest insertion carry Focus 2 instead, and the
 * full optimizer drops out of the headline. That is a perfectly good outcome. What is
 * not good is discovering it in week three, after a UI has been built on top of it.
 *
 * Two scenarios, because the ordinary week alone does not answer the question. A solver
 * that helps a healthy student a little and a struggling one not at all would be a
 * feature with no user, and nobody opens a workload app during a good fortnight.
 *
 * Run with: npm run measure:dof
 */
import { DEFAULT_PARAMS, floorReserve, overallReserve, project } from '../src/engine'
import { umCrunchWeek, umSemesterWeek } from '../src/fixtures/umWeek'
import {
  ALL_PRESENT,
  describeRebalance,
  makeRng,
  neighbours,
  rebalance,
  smallestFixes,
  toDayInputs,
  type Schedule,
} from '../src/optimizer'

/** Fixed so the reported numbers are reproducible; the search is a random-restart climb,
 *  and a measurement nobody can repeat is not a measurement. */
const SEED = 20260908

const lines: string[] = []
const say = (text = '') => lines.push(text)

interface Measured {
  readonly name: string
  readonly movesTaken: number
  readonly floorGain: number
  /** Days lifted out of deficit. The measure that still varies once the floor has
   *  saturated at zero, which is the state a struggling student is actually in. */
  readonly daysRecovered: number
  readonly shiftMovesTaken: number
}

function measure(name: string, schedule: Schedule): Measured {
  const params = DEFAULT_PARAMS

  const movable = schedule.items.filter((item) => !item.fixed && !item.protectedRest)
  const options = neighbours(schedule, params)

  const byKind = new Map<string, number>()
  for (const move of options) byKind.set(move.kind, (byKind.get(move.kind) ?? 0) + 1)

  const before = project(schedule.start, toDayInputs(schedule, ALL_PRESENT), params)
  const result = rebalance(schedule, params, makeRng(SEED))
  const fixes = smallestFixes(schedule, params)

  const takenByKind = new Map<string, number>()
  for (const move of result.moves) {
    takenByKind.set(move.kind, (takenByKind.get(move.kind) ?? 0) + 1)
  }

  say(`## ${name}`)
  say()
  say('| Measure | Value |')
  say('|---|---|')
  say(`| Items in the schedule | ${schedule.items.length} |`)
  say(`| Of those, movable | ${movable.length} |`)
  say(`| Legal single moves available | ${options.length} |`)
  for (const [kind, count] of [...byKind].sort()) {
    say(`| &nbsp;&nbsp;\`${kind}\` | ${count} |`)
  }
  say(`| Starting headline reserve | ${overallReserve(schedule.start).toFixed(1)} |`)
  say(`| Starting floor reserve | ${floorReserve(schedule.start).toFixed(1)} |`)
  say(`| Worst floor before | ${before.worstFloor.toFixed(1)} |`)
  say(`| Worst floor after | ${result.worstAfter.toFixed(1)} |`)
  const after = project(result.schedule.start, toDayInputs(result.schedule, ALL_PRESENT), params)
  say(`| Deficit days before | ${before.deficitDays} |`)
  say(`| Deficit days after | ${after.deficitDays} |`)
  say(`| Deficit area before | ${before.deficitArea.toFixed(0)} |`)
  say(`| Deficit area after | ${after.deficitArea.toFixed(0)} |`)
  say(`| First deficit crossing | ${before.firstDeficitDay ?? 'none'} |`)
  say(`| Moves the search took | ${result.moves.length} |`)
  for (const [kind, count] of [...takenByKind].sort()) {
    say(`| &nbsp;&nbsp;taken: \`${kind}\` | ${count} |`)
  }
  say()
  say(`What the app would say:`)
  say()
  say(`> ${describeRebalance(result, DEFAULT_PARAMS)}`)
  say()
  say('Smallest fixes (§2.2):')
  say()
  if (fixes.length === 0) {
    say('- none found')
  } else {
    for (const fix of fixes) {
      // Report whichever measure actually moved. Printing "worst day 0.0 -> 0.0" for a
      // student in deficit is the exact uninformative line this measurement exposed.
      const effect =
        fix.worstAfter > fix.worstBefore
          ? `worst day ${fix.worstBefore.toFixed(1)} → ${fix.worstAfter.toFixed(1)}`
          : `days underwater ${fix.deficitDaysBefore} → ${fix.deficitDaysAfter}`
      say(`- ${fix.move.description}: ${effect}`)
    }
  }
  say()

  return {
    name,
    movesTaken: result.moves.length,
    floorGain: result.worstAfter - result.worstBefore,
    daysRecovered: before.deficitDays - after.deficitDays,
    shiftMovesTaken: takenByKind.get('shiftDay') ?? 0,
  }
}

say('# §2.5 degrees of freedom')
say()
say('Measured on a realistic UM final-year fortnight, before any rebalance UI exists.')
say()

const ordinary = measure('Ordinary fortnight', umSemesterWeek())
const crunch = measure('Crunch fortnight', umCrunchWeek())

say('## Verdict')
say()

const reschedulingMatters = crunch.shiftMovesTaken > 0
// Counted on whichever measure was available to move: a fortnight already at the floor
// cannot gain reserve points, but it can gain days out of deficit.
const worthwhileGain = crunch.floorGain >= 5 || crunch.daysRecovered >= 3

if (crunch.movesTaken <= 1) {
  say(
    '**Little freedom.** Per §2.5, smallest-fix search, within-day reordering and rest ' +
      'insertion should carry Focus 2. The full optimizer is not the headline.',
  )
} else if (!reschedulingMatters) {
  say(
    '**Freedom, but not the kind advertised.** The solver improves the fortnight, but ' +
      'not by moving work -- rest insertion and sequencing do the lifting. Focus 2 should ' +
      'lead with protected rest and smallest fixes rather than with "we rebalance your week".',
  )
} else if (!worthwhileGain) {
  say(
    '**Legal moves are plentiful but the gain is thin.** Worth building, not worth ' +
      'headlining. Lead Focus 2 with the smallest fix.',
  )
} else {
  say(
    '**The optimizer has real freedom where it matters.** It moves work in the crunch ' +
      'fortnight and gains materially. The full rebalance can headline Focus 2.',
  )
}

say()
say(
  `Ordinary week: ${ordinary.movesTaken} moves, ${ordinary.floorGain.toFixed(1)} reserve ` +
    `points, ${ordinary.daysRecovered} days out of deficit. ` +
    `Crunch week: ${crunch.movesTaken} moves, ${crunch.floorGain.toFixed(1)} reserve points, ` +
    `${crunch.daysRecovered} days out of deficit, ` +
    `${crunch.shiftMovesTaken} moves rescheduling work.`,
)

console.log(lines.join('\n'))
