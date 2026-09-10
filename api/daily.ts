import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { outcomesFrom, type BlockRecord } from '../src/domain/blockLog'
import { todayIndex } from '../src/domain/calendar'
import { checkedInDays } from '../src/domain/blockLog'
import { paramsFor } from '../src/domain/engineParams'
import type { EnergyPrediction } from '../src/domain/predictions'
import { crossingNotice } from '../src/domain/proactive'
import { project } from '../src/engine'
import { toDayInputs, type Schedule } from '../src/optimizer'

/**
 * §26's daily proactive check: the one capability the PWA does not have.
 *
 * Web push on iOS is unreliable and needs the app installed. Telegram always delivers. That
 * is the whole argument for the channel, and it only holds while the messages are worth
 * receiving -- so this loads each linked account, projects it with the same functions every
 * other surface uses, and says nothing at all unless the fortnight's answer has actually
 * changed. `crossingNotice` owns that judgement and lives in `src/domain` where the suite
 * can reach it, because this file is typechecked and never tested.
 *
 * Reads a credential, so it lives here rather than under `src/`. Same containment as
 * `api/telegram.ts`.
 */
export const config = { runtime: 'edge' }

const TELEGRAM_API = 'https://api.telegram.org'

/** What a chat needs before it can be messaged about anything. */
interface LinkedChat {
  readonly chatId: number
  readonly accountId: string
  readonly notifiedDeficitDay: number | null
  readonly notifiedHolds: boolean
}

/**
 * Where the fortnight stops holding, computed exactly as the room and the week grid compute
 * it -- the same params, the same silence-aware projection.
 *
 * A cron quoting a different number from the app about the same week would be worse than
 * silence: the student would open the app to check and find it disagreeing with the message
 * that made them open it.
 */
async function crossingFor(
  client: SupabaseClient,
  accountId: string,
): Promise<number | null | undefined> {
  const { data } = await client
    .from('user_state')
    .select('week, settings')
    .eq('id', accountId)
    .maybeSingle()

  const week = data?.week as Schedule | undefined
  // No week at all is not "holds" -- it is nothing to say anything about.
  if (week === undefined || week.items.length === 0) return undefined

  const today = todayIndex(week, new Date())
  if (today === null) return undefined

  const { data: rows, error } = await client
    .from('block_answers')
    .select('block_id, load_type, planned_hours, day_index, answer, answered_at')
    .eq('account_id', accountId)

  // An unreadable log means "we do not know", and §6.5's pessimism is computed from it.
  // Guessing here would message somebody about a crossing derived from an assumption.
  if (error) return undefined

  const blockLog = ((rows ?? []) as Record<string, unknown>[]).map(
    (row): BlockRecord => ({
      blockId: row.block_id as string,
      type: row.load_type as BlockRecord['type'],
      plannedHours: row.planned_hours as number,
      dayIndex: row.day_index as number,
      answer: row.answer as BlockRecord['answer'],
      answeredAt: Date.parse(row.answered_at as string),
    }),
  )

  const settings = data?.settings as { calibration?: { predictions?: unknown } } | null
  const stored = settings?.calibration?.predictions
  const predictions = (Array.isArray(stored) ? stored : []) as EnergyPrediction[]

  const projection = project(
    week.start,
    toDayInputs(week, checkedInDays(blockLog, today, week.horizonDays)),
    paramsFor(outcomesFrom(blockLog), predictions),
  )

  return projection.firstDeficitDay
}

async function say(botToken: string, chatId: number, text: string): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // No parse_mode, for the reason `send.ts` gives: nothing here should be able to carry
    // formatting a student's own words could break or forge.
    body: JSON.stringify({ chat_id: chatId, text }),
  })
}

export default async function handler(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL

  if (!cronSecret || !botToken || !serviceRoleKey || !supabaseUrl) {
    return new Response('not configured', { status: 503 })
  }

  // Anyone can reach this address. Without the check, a stranger could make the bot message
  // every linked student on demand.
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new Response('no', { status: 401 })
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await client
    .from('telegram_links')
    .select('chat_id, account_id, notified_deficit_day, notified_holds')

  // Migration 0006 is not applied automatically. Answered plainly rather than swallowed:
  // the failure this file must not have is going quietly dead, since nobody would notice
  // for weeks that the messages had stopped.
  if (error) return new Response(`cannot read links: ${error.message}`, { status: 500 })

  const chats = ((data ?? []) as Record<string, unknown>[]).map(
    (row): LinkedChat => ({
      chatId: row.chat_id as number,
      accountId: row.account_id as string,
      notifiedDeficitDay: (row.notified_deficit_day as number | null) ?? null,
      notifiedHolds: Boolean(row.notified_holds),
    }),
  )

  let sent = 0

  for (const chat of chats) {
    try {
      const current = await crossingFor(client, chat.accountId)
      // Undefined means there was nothing honest to compute. Not a reason to message.
      if (current === undefined) continue

      // The two columns collapse back into one value here: a null deficit day only means
      // "holds" once something has actually been said, otherwise it means "never spoken to".
      const previous = chat.notifiedHolds || chat.notifiedDeficitDay !== null
        ? chat.notifiedDeficitDay
        : undefined

      const notice = crossingNotice(previous, current)

      // Recorded even when nothing is sent, so the first run establishes a baseline and the
      // second can tell that something moved. Without this the bot stays silent for ever.
      await client
        .from('telegram_links')
        .update({
          notified_deficit_day: current,
          notified_holds: true,
          notified_at: new Date().toISOString(),
        })
        .eq('chat_id', chat.chatId)

      if (notice === null) continue

      await say(botToken, chat.chatId, `${notice}\n\nSend /rebalance and I will see what would fix it.`)
      sent += 1
    } catch {
      // One student's unreadable row must not stop every other student's message.
      continue
    }
  }

  return new Response(JSON.stringify({ chats: chats.length, sent }), {
    headers: { 'content-type': 'application/json' },
  })
}
