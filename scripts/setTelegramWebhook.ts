/**
 * Points Telegram at a deployment. Run once per bot, and again whenever the address
 * changes.
 *
 * A script in the repository rather than a curl command in a chat log, so the secret is
 * read from the environment instead of being pasted into a shell history, and so the next
 * person does not have to reconstruct the call.
 *
 *   npm run telegram:webhook -- https://your-deployment.vercel.app
 *
 * The secret given here is the one Telegram sends back on every call, and is what
 * api/telegram.ts checks. It must be the same value as TELEGRAM_WEBHOOK_SECRET in the
 * deployment, or every update will be refused.
 */
// Marks the file as a module, which is what allows the top-level awaits below. It has
// nothing to export otherwise -- running it is the whole point.
export {}

const [, , baseUrl] = process.argv

const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

if (!baseUrl) fail('Give the deployment address, e.g. npm run telegram:webhook -- https://x.vercel.app')
if (!token) fail('TELEGRAM_BOT_TOKEN is not set. See .env.example.')
if (!secret) fail('TELEGRAM_WEBHOOK_SECRET is not set. See .env.example.')

// Telegram requires https and will refuse a localhost address, so there is no local
// equivalent of this step -- the webhook only exists against a deployment.
const webhookUrl = new URL('/api/telegram', baseUrl).toString()

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    // Only what the bot actually handles. Asking for less means Telegram sends less, and
    // anything unlisted never reaches the endpoint at all.
    allowed_updates: ['message', 'callback_query'],
    // Anything queued while the webhook was unset is from before this deployment and
    // answering it would be confusing rather than helpful.
    drop_pending_updates: true,
  }),
})

const result = (await response.json()) as { ok: boolean; description?: string }

if (!result.ok) fail(`Telegram refused: ${result.description ?? 'no reason given'}`)

console.log(`Webhook set to ${webhookUrl}`)
