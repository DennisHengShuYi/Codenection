import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HORIZON_DAYS } from '../src/engine'
import type { Schedule } from '../src/optimizer'
import type { PendingDump } from '../src/telegram/brainDump'
import { checkRequest } from '../src/telegram/guard'
import { handleIntent, type ChatStore } from '../src/telegram/handle'
import { hasExpired } from '../src/telegram/linkCode'
import type { Reply } from '../src/telegram/send'
import { readUpdate } from '../src/telegram/update'

/**
 * The chat channel's front door (§13.6), and the only file that reads
 * `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * The service-role key bypasses row-level security completely: whoever holds it can read
 * and write every student's row. Keeping it to one file is the whole containment strategy,
 * the same discipline `GROQ_API_KEY` already follows in `api/plan.ts`. Nothing under `src/`
 * reads it, so it cannot reach the browser bundle even by accident.
 *
 * This file is deliberately thin. Every decision lives in `src/telegram/`, where the unit
 * suite can reach it -- `api/` is typechecked but not covered by vitest, and the guards on
 * the most exposed surface in the product should not be the untested part.
 */
export const config = { runtime: 'edge' }

const TELEGRAM_API = 'https://api.telegram.org'

/** The empty week a brand-new account starts from, matching what the app would create. */
const emptyWeek = (): Schedule => ({
  items: [],
  start: { mental: 70, physical: 70, social: 70, errands: 70 },
  horizonDays: HORIZON_DAYS,
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => 7),
})

/**
 * Storage, as the flows need it.
 *
 * Every method takes the account explicitly, and the account is resolved from the chat
 * exactly once inside `handleIntent`. A chat id is never treated as an identity.
 */
function createStore(client: SupabaseClient): ChatStore {
  return {
    async accountForChat(chatId) {
      const { data } = await client
        .from('telegram_links')
        .select('account_id')
        .eq('chat_id', chatId)
        .maybeSingle()

      return (data?.account_id as string | undefined) ?? null
    },

    async claimLinkCode(code, now) {
      const { data } = await client
        .from('telegram_link_codes')
        .select('account_id, issued_at')
        .eq('code', code.toUpperCase())
        .maybeSingle()

      if (!data) return null

      // Expiry is enforced here rather than by a scheduled cleanup, so a code left in the
      // table by a student who never used it cannot be spent later.
      if (hasExpired(Date.parse(data.issued_at as string), now)) return null

      // Spent, whatever happens next. A code links one chat, once.
      await client.from('telegram_link_codes').delete().eq('code', code.toUpperCase())

      return data.account_id as string
    },

    async linkChat(chatId, accountId) {
      await client
        .from('telegram_links')
        .upsert({ chat_id: chatId, account_id: accountId }, { onConflict: 'chat_id' })
    },

    async loadWeek(accountId) {
      const { data } = await client
        .from('user_state')
        .select('week')
        .eq('id', accountId)
        .maybeSingle()

      return (data?.week as Schedule | undefined) ?? emptyWeek()
    },

    async saveWeek(accountId, week) {
      await client.from('user_state').upsert({ id: accountId, week }, { onConflict: 'id' })
    },

    async savePending(accountId, pending) {
      await client
        .from('telegram_pending')
        .insert({ id: pending.id, account_id: accountId, items: pending.items })
    },

    async findPending(accountId, dumpId) {
      const { data } = await client
        .from('telegram_pending')
        .select('id, items, answered_at')
        .eq('id', dumpId)
        // Scoped to the account as well as the id: a dump id from one account must never
        // resolve for another, even if one were somehow guessed.
        .eq('account_id', accountId)
        .maybeSingle()

      if (!data) return null

      return {
        id: data.id as string,
        items: data.items as PendingDump['items'],
        answeredAt: data.answered_at === null ? null : Date.parse(data.answered_at as string),
      }
    },

    /**
     * §7.9's evidence, recorded and not acted on.
     *
     * Upserted on the account and block together, so answering the same block twice
     * records once -- a student can press a button twice, and Telegram re-sends an update
     * it was not acknowledged for.
     */
    async recordBlockAnswer(accountId, blockId, answer, now) {
      await client.from('block_answers').upsert(
        {
          account_id: accountId,
          block_id: blockId,
          answer,
          answered_at: new Date(now).toISOString(),
        },
        { onConflict: 'account_id,block_id' },
      )
    },

    async markAnswered(accountId, dumpId, now) {
      await client
        .from('telegram_pending')
        .update({ answered_at: new Date(now).toISOString() })
        .eq('id', dumpId)
        .eq('account_id', accountId)
    },
  }
}

async function say(botToken: string, chatId: number, reply: Reply): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply.text,
      // No parse_mode, ever. Every reply echoes something a student typed, and with no
      // formatting there is nothing for their text to break or forge. See send.ts.
      ...(reply.buttons
        ? {
            reply_markup: {
              inline_keyboard: reply.buttons.map((row) =>
                row.map((button) => ({ text: button.label, callback_data: button.data })),
              ),
            },
          }
        : {}),
    }),
  })
}

export default async function handler(request: Request): Promise<Response> {
  const config: Parameters<typeof checkRequest>[1] = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
  }

  const guard = checkRequest(
    { method: request.method, secretHeader: request.headers.get('x-telegram-bot-api-secret-token') },
    config,
  )

  if (!guard.ok) return new Response(guard.body, { status: guard.status })

  // Everything past here answers 200 whatever happens. Telegram re-sends an update it was
  // not acknowledged for, so reporting a failure would produce the same reply twice rather
  // than fixing anything -- and the student has already been told, or cannot be.
  try {
    const update: unknown = await request.json()
    const intent = readUpdate(update)

    const client = createClient(config.supabaseUrl as string, config.serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const reply = await handleIntent(intent, createStore(client), Date.now())

    if (reply !== null && intent.chatId !== null) {
      await say(config.botToken as string, intent.chatId, reply)
    }
  } catch {
    // Deliberately silent to the caller. Anyone can post here, and an error message would
    // describe the inside of the system to whoever asked.
  }

  return new Response('ok')
}
