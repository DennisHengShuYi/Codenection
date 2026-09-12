/**
 * Writes `demoAccount`'s fortnight into one Supabase account, for testing and demoing the
 * app against a week that has history behind it.
 *
 *   npm run seed:account -- someone@example.com          # dry run, writes nothing
 *   npm run seed:account -- someone@example.com --commit # actually writes
 *
 * **This writes to a real database as a real account, and it replaces that account's week,
 * settings and answered blocks.** It exists for a disposable test login -- the same rule
 * `.env.example` states over `INTEGRATION_TEST_EMAIL`: "Never a real student's login."
 *
 * A script in the repository rather than SQL pasted into a dashboard, for
 * `setTelegramWebhook`'s reason: the secret is read from the environment instead of a shell
 * history, the data comes from a tested fixture rather than being retyped, and the next
 * person does not have to reconstruct it.
 *
 * It needs `SUPABASE_SERVICE_ROLE_KEY` because it writes rows *as* another account, which
 * the anon key cannot do -- `0002`'s policies key every row to `auth.uid()`. That key
 * bypasses row-level security entirely, which is why this refuses to run without an
 * explicit `--commit` and why it touches only the one account id it resolved by email.
 */
export {}

import { createClient } from '@supabase/supabase-js'
import { demoAccount, scatter, DAYS_BEHIND } from '../src/fixtures/demoAccount'

const [, , email, ...flags] = process.argv
const commit = flags.includes('--commit')

/**
 * `--scatter <seed>` throws the movable half of the fortnight around, so Rebalance and the
 * forecast have a real problem to work on rather than the tidy repeating week.
 *
 * Seeded so a demo can be run twice and look the same. Days already lived are never touched
 * -- see `scatter` itself.
 */
const scatterAt = flags.indexOf('--scatter')
const scatterSeed = scatterAt === -1 ? null : Number(flags[scatterAt + 1] ?? 1)

if (scatterSeed !== null && Number.isNaN(scatterSeed)) {
  fail('--scatter needs a number, e.g. --scatter 3')
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!email) fail('Give the account email, e.g. npm run seed:account -- you@example.com')

const url = process.env.VITE_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url) fail('VITE_SUPABASE_URL is not set. See .env.example.')
if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set. See .env.example.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

/** The student's own day, not the server's (§9 puts this app at UTC+8, where a UTC-derived
 *  "today" is wrong for the first eight hours of every day). */
const todayIso =
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

// Paged rather than assuming the first page holds everybody: a project with more than one
// screen of accounts would otherwise silently report "no such account" for a real one.
async function findAccountId(wanted: string): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) fail(`Could not list accounts: ${error.message}`)

    const match = data.users.find((user) => user.email?.toLowerCase() === wanted.toLowerCase())
    if (match) return match.id
    if (data.users.length < 200) return null
  }

  return null
}

const accountId = await findAccountId(email)
if (accountId === null) fail(`No account found for ${email}. Sign up first, then re-run.`)

const built = demoAccount(todayIso)
const week = scatterSeed === null ? built.week : scatter(built.week, scatterSeed, DAYS_BEHIND)
const { blockLog, profile } = built

console.log(`account   ${email}  (${accountId})`)
console.log(`today     ${todayIso}  -> day ${DAYS_BEHIND} of the fortnight`)
console.log(`anchor    ${week.startedOn}  (day 0)`)
console.log(`writing   ${week.items.length} events, ${blockLog.length} answered blocks, ${profile.predictions.length} energy reports`)
console.log(`scatter   ${scatterSeed === null ? 'off (tidy repeating week)' : `seed ${scatterSeed}`}`)

const hours: number[] = Array.from({ length: 21 }, () => 0)
for (const entry of week.items) {
  if (entry.kind !== 'rest') hours[entry.dayIndex] = (hours[entry.dayIndex] ?? 0) + entry.hours
}
console.log(`hours/day ${hours.map((h, day) => (day === DAYS_BEHIND ? `[${h}]` : `${h}`)).join(' ')}`)

if (!commit) {
  console.log('\nDry run. Nothing was written. Re-run with --commit to apply.')
  process.exit(0)
}

const { error: stateError } = await admin
  .from('user_state')
  .upsert({ id: accountId, week, settings: { lowEnergyOverride: 'auto', calibration: profile } })

if (stateError) fail(`Could not write the week: ${stateError.message}`)

const { error: logError } = await admin.from('block_answers').upsert(
  blockLog.map((record) => ({
    account_id: accountId,
    block_id: record.blockId,
    load_type: record.type,
    planned_hours: record.plannedHours,
    day_index: record.dayIndex,
    answer: record.answer,
    answered_at: new Date(record.answeredAt).toISOString(),
  })),
  { onConflict: 'account_id,block_id' },
)

if (logError) fail(`Could not write the block log: ${logError.message}`)

console.log('\nWritten. Reload the app signed in as that account.')
