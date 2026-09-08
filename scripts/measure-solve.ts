import { DEFAULT_PARAMS } from '../src/engine'
import { umCrunchWeek, umSemesterWeek } from '../src/fixtures/umWeek'
import { makeRng, rebalance, score } from '../src/optimizer'

for (const [name, make] of [
  ['ordinary', umSemesterWeek],
  ['crunch', umCrunchWeek],
] as const) {
  const schedule = make()

  const started = performance.now()
  const result = rebalance(schedule, DEFAULT_PARAMS, makeRng(1))
  const elapsed = performance.now() - started

  console.log(
    `${name.padEnd(9)} ${elapsed.toFixed(0)}ms  ${String(result.evaluations).padStart(5)} evals  ` +
      `score ${score(result.schedule, DEFAULT_PARAMS).toFixed(3)}  ${result.moves.length} moves`,
  )
}
