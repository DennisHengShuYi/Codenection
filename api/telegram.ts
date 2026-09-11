import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { transcribeAudio } from '../src/ai/groq'
import { readPhoto } from '../src/ai/readPhoto'
import type { Calendar } from '../src/ai/types'
import { readRequest } from '../src/ai/readRequest'
import { draftReplies } from '../src/ai/drafts'
import type { BlockRecord } from '../src/domain/blockLog'
import type { EnergyPrediction } from '../src/domain/predictions'
import { DEFAULT_SLEEP_HOURS, HORIZON_DAYS } from '../src/engine'
import type { Schedule } from '../src/optimizer'
import type { PendingDump } from '../src/telegram/brainDump'
import { checkRequest } from '../src/telegram/guard'
import { handleIntent, type ChatServices, type ChatStore } from '../src/telegram/handle'
import { hasExpired } from '../src/telegram/linkCode'
import { priceAskWith } from '../src/telegram/priceAsk'
import type { Reply } from '../src/telegram/render'
import { callbackIdOf, messageIdOf, readUpdate } from '../src/telegram/update'
import { readServiceRoleKey, readSupabaseUrl } from '../src/data/serverEnv'

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
  sleepByDay: Array.from({ length: HORIZON_DAYS }, () => DEFAULT_SLEEP_HOURS),
})

/**
 * Storage, as the flows need it.
 *
 * Every method takes the account explicitly, and the account is resolved from the chat
 * exactly once inside `handleIntent`. A chat id is never treated as an identity.
 */
export function createStore(client: SupabaseClient): ChatStore {
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
     * §8b②'s evidence, now readable: the same four-answer vocabulary and the same three
     * columns (`load_type`, `planned_hours`, `day_index`) the today card writes through
     * `supabaseRepository.ts`, so a record written from either place produces the same
     * `BlockOutcome` once `outcomesFrom` reads it back.
     *
     * Upserted on the account and block together, so answering the same block twice
     * records once -- a student can press a button twice, and Telegram re-sends an update
     * it was not acknowledged for.
     */
    async recordBlockAnswer(accountId, answer, now) {
      const { error } = await client.from('block_answers').upsert(
        {
          account_id: accountId,
          block_id: answer.blockId,
          load_type: answer.type,
          planned_hours: answer.plannedHours,
          day_index: answer.dayIndex,
          answer: answer.answer,
          answered_at: new Date(now).toISOString(),
        },
        { onConflict: 'account_id,block_id' },
      )

      // Thrown rather than dropped. `0005_block_log.sql` is NOT applied automatically, so
      // on an unmigrated deployment `load_type`, `planned_hours` and `day_index` do not
      // exist and every write here fails -- silently, until now, while the student was
      // told "Noted." `src/data/supabaseRepository.ts` already threw on the same failure;
      // this side had been swallowing it. Ruling 42.
      if (error) throw new Error(`Could not record block answer: ${error.message}`)
    },

    /**
     * The same rows read back, in the shape `outcomesFrom` and `checkedInDays` expect.
     *
     * Deliberately identical to `supabaseRepository.loadBlockLog` -- the columns, the
     * mapping and the throw -- because §2.4's evidence must not depend on which door the
     * student came through, which is the whole of Ruling 41.
     */
    async loadBlockLog(accountId) {
      const { data, error } = await client
        .from('block_answers')
        .select('block_id, load_type, planned_hours, day_index, answer, answered_at')
        .eq('account_id', accountId)

      // An empty log and an unreadable one mean opposite things. Collapsing them would
      // price a request as though the student had answered nothing, which is a real
      // number computed from an assumption nobody made.
      if (error) throw new Error(`Could not read block log: ${error.message}`)

      return ((data ?? []) as Record<string, unknown>[]).map(
        (row): BlockRecord => ({
          blockId: row.block_id as string,
          type: row.load_type as BlockRecord['type'],
          plannedHours: row.planned_hours as number,
          dayIndex: row.day_index as number,
          answer: row.answer as BlockRecord['answer'],
          answeredAt: Date.parse(row.answered_at as string),
        }),
      )
    },

    /**
     * §8.1's resolved predictions, from the same `user_state.settings` blob the app writes.
     *
     * Empty rather than thrown on failure, and the asymmetry with `loadBlockLog` is
     * deliberate: an absent profile is an ordinary state -- a student who has answered
     * nothing yet -- whereas an unreadable block log means "we do not know", which must not
     * be collapsed into "they answered nothing". Here the worst case of guessing wrong is
     * the population defaults, which is what the app itself uses on day one.
     */
    async loadPredictions(accountId) {
      const { data } = await client
        .from('user_state')
        .select('settings')
        .eq('id', accountId)
        .maybeSingle()

      const settings = data?.settings as { calibration?: { predictions?: unknown } } | null
      const predictions = settings?.calibration?.predictions

      return Array.isArray(predictions) ? (predictions as EnergyPrediction[]) : []
    },

    /**
     * Writes §8.1's predictions back after a check-in answered in chat.
     *
     * Reads the row and merges into it rather than upserting a whole settings blob: the app
     * writes that blob entire from the browser, and a bot replacing it would drop whatever
     * the student had changed there since. Only the predictions are ours to touch.
     */
    async savePredictions(accountId, predictions) {
      const { data } = await client
        .from('user_state')
        .select('settings')
        .eq('id', accountId)
        .maybeSingle()

      const settings = (data?.settings as Record<string, unknown> | null) ?? {}
      const calibration = (settings.calibration as Record<string, unknown> | undefined) ?? {}

      await client.from('user_state').upsert(
        { id: accountId, settings: { ...settings, calibration: { ...calibration, predictions } } },
        { onConflict: 'id' },
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

/**
 * Turns a Telegram file reference into the bytes behind it.
 *
 * Two calls: getFile gives a path, and the path is fetched from a second host. The bot
 * token appears in the download URL, which is why this lives here and nowhere else.
 */
async function fetchTelegramFile(botToken: string, fileId: string): Promise<Blob | null> {
  const lookup = await fetch(`${TELEGRAM_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`)
  const described = (await lookup.json()) as { ok: boolean; result?: { file_path?: string } }

  const path = described.result?.file_path
  if (!described.ok || path === undefined) return null

  const file = await fetch(`${TELEGRAM_API}/file/bot${botToken}/${path}`)
  return file.ok ? await file.blob() : null
}

/**
 * Ruling 24: replaces a message in place when the reply asks for it and there is one to replace.
 *
 * Falls back to sending, always. An edit can fail for reasons that are nobody's fault -- the
 * message is too old, or its content is unchanged, which Telegram treats as an error -- and
 * a student who pressed a button must see *something* happen either way.
 */
async function say(
  botToken: string,
  chatId: number,
  reply: Reply,
  replacing: number | null = null,
): Promise<void> {
  const markup = reply.buttons
    ? {
        reply_markup: {
          inline_keyboard: reply.buttons.map((row) =>
            row.map((button) => ({ text: button.label, callback_data: button.data })),
          ),
        },
      }
    : {}

  if (reply.replaceMessage === true && replacing !== null) {
    const edited = await fetch(`${TELEGRAM_API}/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: replacing,
        text: reply.text,
        // An edit with no keyboard has to say so explicitly, or the old buttons survive on
        // a message that no longer means what they did.
        reply_markup: markup.reply_markup ?? { inline_keyboard: [] },
      }),
    })

    if (edited.ok) return
  }

  await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: reply.text,
      // No parse_mode, ever. Every reply echoes something a student typed, and with no
      // formatting there is nothing for their text to break or forge. See render.ts.
      ...markup,
    }),
  })
}

/**
 * Clears the loading spinner Telegram puts on a tapped button.
 *
 * Owed for every press, including ones that read as `unhandled` -- an unrecognised button
 * is exactly the case where a student is left staring at a spinner with nothing else
 * happening. Failures are swallowed: this is an acknowledgement, and a student who cannot
 * be told their tap registered is still better served by the reply that follows than by an
 * exception that loses it.
 */
async function acknowledge(botToken: string, callbackId: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId }),
    })
  } catch {
    // Nothing to do and nobody to tell. The reply itself is the real answer.
  }
}

export default async function handler(request: Request): Promise<Response> {
  const config: Parameters<typeof checkRequest>[1] = {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    // The same project the browser's endpoints verify sessions against, and trimmed
    // the same way -- a webhook on a different project writes where nothing reads.
    serviceRoleKey: readServiceRoleKey(process.env as Record<string, string | undefined>) ?? undefined,
    supabaseUrl: readSupabaseUrl(process.env as Record<string, string | undefined>) ?? undefined,
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
    const callbackId = callbackIdOf(update)
    const pressedOn = messageIdOf(update)

    const client = createClient(config.supabaseUrl as string, config.serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const groqKey = process.env.GROQ_API_KEY
    const botToken = config.botToken as string

    // Before the work, not after: the spinner is showing now, and `handleIntent` can take a
    // model call's worth of seconds to come back.
    if (callbackId !== null) await acknowledge(botToken, callbackId)

    /**
     * The model-backed calls, assembled here because this is the only file that may read a
     * credential. Each is left undefined when its key is absent, which the flows treat as
     * an ordinary state rather than an error -- and which is exactly CI and the demo.
     */
    const services: ChatServices = groqKey
      ? {
          readPhotoFile: async (fileId: string, calendar?: Calendar) => {
            const blob = await fetchTelegramFile(botToken, fileId)
            if (blob === null) return null

            const outcome = await readPhoto(
              new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' }),
              calendar,
            )

            // Only the items cross into the flow. Whether the read succeeded is answered by
            // null, so the chat never has to know PhotoOutcome's shape.
            return outcome.ok ? outcome.items : null
          },

          transcribe: async (fileId: string) => {
            const blob = await fetchTelegramFile(botToken, fileId)
            return blob === null ? null : transcribeAudio(blob, groqKey)
          },

          // One service rather than three: §2.3's answer is all of it or none. A cost with
          // no drafts is a number to worry about with nothing to do.
          //
          // A binding rather than a composition: the pricing itself lives in
          // `src/telegram/priceAsk.ts` where the unit suite can reach it. It was inline
          // here, and it was wrong in three ways for as long as it existed (Ruling 41) --
          // day 0, no evidence, population calibration -- precisely because `api/` is
          // typechecked and untested.
          priceAsk: (text, week, today, blockLog) =>
            priceAskWith({ readRequest, draftReplies }, text, week, today, blockLog),
        }
      : {}

    const reply = await handleIntent(intent, createStore(client), Date.now(), services)

    if (reply !== null && intent.chatId !== null) {
      await say(config.botToken as string, intent.chatId, reply, pressedOn)
    }
  } catch {
    // Deliberately silent to the caller. Anyone can post here, and an error message would
    // describe the inside of the system to whoever asked.
  }

  return new Response('ok')
}
