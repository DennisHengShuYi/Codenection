import type { ActivityKind } from '../engine'
import type { RecoveryAttempt, Schedule } from '../optimizer'

/**
 * §5.2's last line: failed recovery is logged, so the app stops prescribing the failure.
 *
 * If lying down does nothing but a walk works, suggesting lying down again is how advice
 * stops being read at all. Both outcomes are recorded rather than only failures -- a log
 * that remembers only what went wrong is a blocklist, and it would forget what the app
 * should be repeating.
 */
export function recordAttempt(
  schedule: Schedule,
  kind: ActivityKind,
  helped: boolean,
): Schedule {
  const attempt: RecoveryAttempt = { kind, helped }

  return { ...schedule, recoveryLog: [...(schedule.recoveryLog ?? []), attempt] }
}

/** Empty rather than undefined, so callers never have to know that weeks saved before this
 *  feature have no such field. */
export function attemptsIn(schedule: Schedule): readonly RecoveryAttempt[] {
  return schedule.recoveryLog ?? []
}
