import type { ActivityKind } from '../engine'
import { sameFamily, taskKeyOf } from './taskKey'
import type { KnownTitle } from './titleVocabulary'

/**
 * A model's phrasing, pulled back onto the name the student already uses.
 *
 * §2.4's narrow rungs group answers by title, and on the AI paths the title is not the
 * student's -- it is whatever the model wrote from their sentence. From one gym habit it
 * will produce "Gym session" one week and "Workout" the next, and every phrasing is a new
 * bucket starting at zero answers. Nothing fills, and the feature is quietly dead for
 * everyone who does not type their own blocks.
 *
 * The model is also told the list (`ai/vocabulary`), which helps and cannot be relied upon:
 * a prompt is advice. This runs on the answer, so it holds whatever the model felt like
 * saying.
 *
 * Two guards, both narrow on purpose -- a wrong snap renames something the student did not
 * rename, and on these paths they are skimming cards rather than reading a form:
 *
 *   * the kind must match, because the words alone cannot tell "Run" from "Run errands";
 *   * a known name with no recorded kind is never snapped onto, since a guard that cannot
 *     check is a guard that must not fire.
 *
 * The matcher is `taskKey.sameFamily`, the same one the buckets use, so one rule decides
 * what counts as the same thing rather than two that drift apart.
 */
export function snapTitle(
  proposed: { readonly title: string; readonly kind: ActivityKind },
  known: readonly KnownTitle[],
): string {
  if (proposed.title.trim() === '') return proposed.title

  const key = taskKeyOf(proposed.title)

  const match = known.find(
    (candidate) =>
      candidate.kind === proposed.kind && sameFamily(taskKeyOf(candidate.title), key),
  )

  return match?.title ?? proposed.title
}
