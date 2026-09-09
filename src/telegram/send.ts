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

/** Named so a student can see the whole surface at once. §4.1 and §5.2 both depend on
 *  somebody remembering the command exists at the moment they need it. */
export const helpReply = (): Reply => ({
  text: [
    'What I can do:',
    '',
    '/today — go through today’s blocks',
    '/yesterday — confirm yesterday in one go',
    '/rest — one thing that would help right now',
    '/stuck <task> — one small first step',
    '/ask <what they asked> — what saying yes would cost',
    '',
    'Anything else you send, I read as things to add to your week.',
  ].join('\n'),
})

/** The shape a check-in needs from a block, so this module does not depend on the whole
 *  scheduling model to write a sentence. */
export interface BlockLine {
  readonly id: string
  readonly title: string
  readonly startHour: number
}

const clockOf = (hour: number): string => `${String(Math.floor(hour)).padStart(2, '0')}:00`

export function blocksReply(day: 'today' | 'yesterday', blocks: readonly BlockLine[]): Reply {
  if (blocks.length === 0) {
    return { text: `Nothing was scheduled ${day}.` }
  }

  const first = blocks[0] as BlockLine
  const listed = blocks.map((block) => `• ${clockOf(block.startHour)} ${shorten(block.title)}`)

  return {
    text: [`${day === 'today' ? 'Today' : 'Yesterday'}:`, '', ...listed, '', `Did ${shorten(first.title)} happen?`].join('\n'),
    // §7.9's three answers. "Partly" is the honest answer for most blocks, and dropping it
    // pushes people into a yes or a no that is not true.
    buttons: [
      [
        { label: 'Yes', data: `block:${first.id}:yes` },
        { label: 'Partly', data: `block:${first.id}:partly` },
        { label: 'No', data: `block:${first.id}:no` },
      ],
    ],
  }
}

/**
 * §7.9's "never punish a miss", and §1.3's mirror-not-scold rule.
 *
 * A student who did not do the thing is exactly the one whose data is most worth having,
 * and a comment on it is how they stop answering. So a no reads the same as a yes.
 */
export const blockAnsweredReply = (_answer: 'yes' | 'no' | 'partly'): Reply => ({
  text: 'Noted.',
})

export function restReply(prescription: {
  title: string
  startHour: number
  hours: number
}): Reply {
  return {
    text: `${prescription.title}, at ${clockOf(prescription.startHour)}. About ${prescription.hours === 1 ? 'an hour' : `${prescription.hours} hours`}.`,
    // Exactly one thing to accept. §5.2: every extra option lowers the odds of any action.
    buttons: [
      [
        { label: 'Put it in', data: `rest:accept:${prescription.startHour}` },
        { label: 'Not now', data: 'rest:decline' },
      ],
    ],
  }
}

export const noGapReply = (): Reply => ({
  text: 'There is no gap left today to put anything in. Worth looking at tomorrow instead.',
})

/** §4.1: one action and a time box, and nothing else. No encouragement, no asking why --
 *  somebody using this has already told you they are stuck. */
export const microStartReply = (start: { action: string; minutes: number }): Reply => ({
  text: `${start.action} ${start.minutes} minutes.`,
})

export const taskNotFoundReply = (): Reply => ({
  text: 'I cannot find that in your week. Send /today to see what is there.',
})

export const needTaskReply = (): Reply => ({
  text: 'Which task? Send /stuck and the name of it.',
})

export const needRequestReply = (): Reply => ({
  text: 'Send /ask and what they asked you for, and I will tell you what saying yes would cost.',
})

export function askReply(
  cost: {
    firstDeficitDayBefore: number | null
    firstDeficitDayAfter: number | null
    eveningsEquivalent: number
  },
  drafts: readonly { tone: 'decline' | 'defer' | 'accept'; text: string }[],
): Reply {
  const evenings =
    cost.eveningsEquivalent <= 0
      ? 'almost nothing you had planned'
      : cost.eveningsEquivalent === 1
        ? 'about one evening'
        : `about ${cost.eveningsEquivalent} evenings`

  // Only named when it actually moved. Telling somebody their first bad day is unchanged is
  // noise; telling them it moved when it did not would be a lie the whole feature rests on.
  const moved =
    cost.firstDeficitDayAfter !== null &&
    cost.firstDeficitDayAfter !== cost.firstDeficitDayBefore
      ? ['', `It moves your first bad day to day ${cost.firstDeficitDayAfter}.`]
      : []

  const byTone = (tone: 'decline' | 'defer' | 'accept'): string =>
    drafts.find((draft) => draft.tone === tone)?.text ?? ''

  return {
    // §2.3: never "this takes 6 hours". Always what it costs in what gets given up.
    text: [
      `Saying yes costs you ${evenings}.`,
      ...moved,
      '',
      'Three ways to answer — copy whichever fits:',
      '',
      `No: ${byTone('decline')}`,
      '',
      `Later: ${byTone('defer')}`,
      '',
      `Yes: ${byTone('accept')}`,
    ].join('\n'),
    // Deliberately no buttons. §2.3: the app does the work of declining and the student
    // keeps the decision, so there must be nothing here that sends anything to anybody.
  }
}

export const voiceTooLongReply = (): Reply => ({
  text: 'That recording is longer than I can read in one go. Send a shorter one, or type it instead.',
})

export const transcriptionUnavailableReply = (): Reply => ({
  text: 'I cannot listen to voice notes right now. Type it and I will read it the same way.',
})

export const photoUnreadableReply = (): Reply => ({
  text: 'I could not read that image. A clearer photo, or type what is on it.',
})

/**
 * §7.9's retroactive fill, and why it cannot be answered yet.
 *
 * `Schedule` carries `dayIndex` and `horizonDays` but no date, so day 0 is today by
 * convention and the horizon runs forward only. There is no yesterday in the model to look
 * up, and answering with today's blocks under yesterday's name would put wrong data into
 * the very table §2.4 will later trust.
 */
export const yesterdayUnavailableReply = (): Reply => ({
  text: 'I do not keep past days yet, so there is nothing to look back at. Use /today and I will go through today with you.',
})

export const restBookedReply = (): Reply => ({
  text: 'In. Nothing will be scheduled over it.',
})

/** Said plainly rather than priced as something invented: a cost derived from a request
 *  nobody understood is a number with nothing behind it. */
export const askUnreadableReply = (): Reply => ({
  text: 'I could not work out what was being asked there. Try it in the words they used, like "can you cover my shift on Saturday".',
})

export const askUnavailableReply = (): Reply => ({
  text: 'I cannot price a request right now. The app can, on the request box screen.',
})

export const photoTooBigReply = (): Reply => ({
  text: 'That image is larger than I can read. Send a smaller one, or type what is on it.',
})

/** §1.4's own stance: photo import has no fallback, because reading an image needs the
 *  model. Said plainly rather than pretending otherwise. */
export const photoUnavailableReply = (): Reply => ({
  text: 'I cannot read images right now. Type what is on it and I will read that the same way.',
})
