import type { ParsedItem } from '../ai'

/**
 * What the bot says, kept apart from the endpoint that says it.
 *
 * These are pure: text and buttons in, a payload out, nothing sent. That is what lets every
 * reply be tested without a network, and it is why the endpoint has almost no wording of
 * its own.
 */
export interface Reply {
  readonly text: string
  /** Rows of buttons. `data` is what comes back as a callback query (see update.ts). */
  readonly buttons?: ReadonlyArray<ReadonlyArray<{ label: string; data: string }>>
  /**
   * Deliberately never set.
   *
   * Every reply here echoes something a student typed. With no formatting mode there is no
   * formatting to break, so a brain dump full of asterisks, underscores or brackets cannot
   * produce a mangled or misleading message -- and cannot be used to fake one either.
   */
  readonly parseMode?: undefined
}

/** Telegram's own limit is far higher; this keeps one absurd item from filling the screen
 *  and pushing the buttons out of sight. */
export const MAX_ECHO_LENGTH = 200

const shorten = (text: string): string =>
  text.length <= MAX_ECHO_LENGTH ? text : `${text.slice(0, MAX_ECHO_LENGTH - 1)}…`

export const linkedReply = (): Reply => ({
  text: 'Linked. Send me whatever is on your mind and I will turn it into a week.',
})

/** Says how to link and nothing else. Anyone can message the bot, so an unlinked chat must
 *  learn nothing about whether an account exists. */
export const notLinkedReply = (): Reply => ({
  text: 'This chat is not linked to an account yet. Open the app, sign in, and choose "Link Telegram" — it will give you a link that opens this chat.',
})

/** No apology and no telling-off: §1.3's mirror-not-scold rule applies to the bot too. */
export const unhandledReply = (): Reply => ({
  text: 'I can turn a message into a week. Type what you are carrying — deadlines, chores, plans — and I will show you what I understood before anything is saved.',
})

export const nothingUnderstoodReply = (): Reply => ({
  text: 'I could not pick anything out of that. Try naming the things themselves, like "essay due friday, gym twice, mum\'s birthday sunday".',
})

export function confirmationReply(dumpId: string, items: readonly ParsedItem[]): Reply {
  const lines = items.map((entry) => `• ${shorten(entry.title)}`).join('\n')

  return {
    text: `Here is what I understood:\n\n${lines}\n\nAdd these to your week?`,
    buttons: [
      [
        { label: 'Add them', data: `confirm:${dumpId}` },
        { label: 'Discard', data: `discard:${dumpId}` },
      ],
    ],
  }
}

export const appliedReply = (count: number): Reply => ({
  text: count === 1 ? 'Added 1 thing to your week.' : `Added ${count} things to your week.`,
})

export const discardedReply = (): Reply => ({
  text: 'Discarded — nothing was added.',
})

/** Refused in words rather than silently truncated: a student whose brain dump was quietly
 *  cut in half would never know which half was kept. */
export const tooLongReply = (): Reply => ({
  text: 'That is too long for me to read in one go. Send it in a couple of shorter messages and I will take them one at a time.',
})
