import type { ParsedItem } from '../ai'
import type { Draft } from '../ai/draftTemplates'
import { outcomesFrom, type BlockRecord } from '../domain/blockLog'
import { paramsFor } from '../domain/engineParams'
import { priceRequest, type RequestCost } from '../domain/requestCost'
import type { Schedule } from '../optimizer'

/**
 * The two model-backed calls `/ask` composes, injected rather than imported.
 *
 * Same discipline as `ChatServices`: `api/telegram.ts` is the only file that may hold a
 * credential, so it supplies these and this module stays runnable in the unit suite with no
 * key anywhere in reach.
 */
export interface AskModel {
  readRequest: (text: string) => Promise<ParsedItem | null>
  draftReplies: (item: ParsedItem, cost: RequestCost) => Promise<{ drafts: readonly Draft[] }>
}

/**
 * Prices a request that arrived through the chat, exactly as the app's own request box
 * prices one that arrived through the screen.
 *
 * This composition used to live inline in `api/telegram.ts`, which is typechecked but not
 * covered by vitest, and it was wrong in three ways at once (Ruling 41): it priced against
 * day 0 of the fortnight whatever day it was, against no check-in evidence, and at the
 * population calibration rather than the student's own. Nothing failed, because
 * `priceRequest` defaulted the first two and `DEFAULT_PARAMS` is a perfectly ordinary
 * argument for the third. One student, one week, two prices depending on the door.
 *
 * It is here rather than there for the reason `api/telegram.ts`'s own docstring gives:
 * every decision lives in `src/telegram/`, where the unit suite can reach it. What is left
 * behind is a binding of `readRequest` and `draftReplies`, which has nothing to get wrong.
 *
 * `today` and `blockLog` are required parameters, and `params` is derived from the log
 * rather than passed, because the calibration and the evidence must be the same student's.
 */
export async function priceAskWith(
  model: AskModel,
  text: string,
  week: Schedule,
  today: number,
  blockLog: readonly BlockRecord[],
): Promise<{ cost: RequestCost; drafts: readonly Draft[]; item: ParsedItem } | null> {
  // Null means the request could not be read, which is said plainly rather than priced as
  // something invented.
  const item = await model.readRequest(text)
  if (item === null) return null

  // §7.3/§8b: the durable block log is the single source of the estimate bias, on both
  // surfaces. `RoomShell` and `roomModel` derive `paramsFor(outcomesFrom(blockLog))` from
  // exactly this, so a student who consistently overruns is quoted a price that knows it.
  const cost = priceRequest(week, item, paramsFor(outcomesFrom(blockLog)), today, blockLog)
  const { drafts } = await model.draftReplies(item, cost)

  // The item travels back with the price so §2.3's provisional yes has something real to
  // accept. Re-reading the text at accept time would risk pricing one thing and adding
  // another -- the model is not guaranteed to answer twice the same way.
  return { cost, drafts, item }
}
