import type { ParsedItem } from '../ai'
import type { BlockAnswer } from '../domain/blockLog'
import { hasHappened } from '../domain/dayBlocks'
import type { LoadType } from '../engine'

/**
 * What the bot says, kept apart from the endpoint that says it.
 *
 * These are pure: values in, a payload out, nothing sent. That is what lets every reply be
 * tested without a network, and it is why the endpoint has almost no wording of its own.
 *
 * Ruling 25's render layer, and the file was already it -- the rename is what stops the name
 * arguing with the contents. `send.ts` sent nothing; the network call has always lived in
 * `api/telegram.ts`.
 *
 * The rule this file is under: the bot decides nothing. Every figure arrives already
 * computed by `src/domain` or `src/optimizer`, so a threshold comparison appearing here
 * would mean a second model of the same student living in the chat layer. Two renderers over
 * one model is sustainable; two models is not.
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
  /**
   * Ruling 24: replace the message the button was pressed on, rather than sending a new one.
   *
   * Set only by replies that are *navigation* -- a day opened from the fortnight, a step
   * back out of it. Everything else stays an ordinary new message, because a reply that
   * answers a question should sit in the log where the student can scroll back to it.
   *
   * A reply is not required to know whether it can be edited: `api/telegram.ts` falls back
   * to sending when there is no message to replace, so this is a preference rather than an
   * instruction.
   */
  readonly replaceMessage?: true
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

/**
 * §1.4: flagged rather than silently guessed. A student cannot correct what they were never
 * shown -- and this dropped `entry.confident` entirely, so a row the model guessed at looked
 * identical to a plainly-stated one, immediately above a one-tap "Add them".
 *
 * The app's own chip has said so since §1.4 was built ("Not sure about this one -- check it
 * before adding"). The bot is meant to be the same app through another door, so it says the
 * same thing in the shape a text message has: a suffix rather than a second line, because
 * there are no chips to colour here.
 */
export function confirmationReply(dumpId: string, items: readonly ParsedItem[]): Reply {
  const lines = items
    .map((entry) => `• ${shorten(entry.title)}${entry.confident ? '' : ' — not sure, check this'}`)
    .join('\n')

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
    '/week — where you are, and where it stops holding',
    '/today — go through today’s blocks',
    '/yesterday — confirm yesterday in one go',
    '/day 3 — any other day of the fortnight',
    '/rebalance — move things around and tell you what changed',
    '/rest — one thing that would help right now',
    '/stuck <task> — one small first step',
    '/ask <what they asked> — what saying yes would cost',
    '/lapsed — what you said yes to that no longer fits',
    '/schedule — the whole fortnight at a glance',
    '/checkin — how today went, in one tap',
    '',
    'Anything else you send, I read as things to add to your week — including a photo of a',
    'timetable, or a voice note if it is easier than typing.',
  ].join('\n'),
})

/** The shape a check-in needs from a block, so this module does not depend on the whole
 *  scheduling model to write a sentence. `type`, `hours` and `dayIndex` exist only so they
 *  can be carried back in the callback -- see `blockAnswerData` -- since the callback is the
 *  only place that information survives the round trip to `recordBlockAnswer` (§8b②). */
export interface BlockLine {
  readonly id: string
  readonly title: string
  readonly startHour: number
  readonly type: LoadType
  readonly hours: number
  readonly dayIndex: number
}

const clockOf = (hour: number): string => `${String(Math.floor(hour)).padStart(2, '0')}:00`

/** The single letter each load type is encoded as in `callback_data`. Kept to one character
 *  because the block id is the part of the payload with no fixed length, and Telegram caps
 *  `callback_data` at 64 bytes. */
const TYPE_CODE: Record<LoadType, string> = {
  mental: 'm',
  physical: 'p',
  social: 's',
  errands: 'e',
}

/** The single digit each of §8b②'s four answers is encoded as. `update.ts` holds the
 *  matching reverse map -- if either changes, so must the other. */
const ANSWER_CODE: Record<BlockAnswer, string> = {
  didnt: '0',
  less: '1',
  right: '2',
  longer: '3',
}

/** One button's payload: the block's identity and the evidence `recordBlockAnswer` needs to
 *  compute an outcome from, plus which of the four answers this button is. */
const blockAnswerData = (block: BlockLine, answer: BlockAnswer): string =>
  `block:${block.id}:${TYPE_CODE[block.type]}:${block.hours}:${block.dayIndex}:${ANSWER_CODE[answer]}`

/**
 * The day's blocks, and one question about the first of them still unanswered.
 *
 * `answered` is §8b's durable log, reduced to the ids it holds. Without it this asked about
 * `blocks[0]` unconditionally, which meant a student who answered their first block was
 * asked about that same block on every subsequent `/today` while every other block on the
 * day stayed unreachable from their phone. The app has never worked that way -- `blockToAsk`
 * skips what the log already holds -- and §8b② is explicit that a student answering in both
 * places must not meet two different questions.
 *
 * Still one question rather than a keyboard per block: that is the today card's discipline
 * (§8, "one card, three taps, once a day"), and four buttons times a full day is a menu.
 * Optional and defaulting to empty so callers built before the log was threaded here keep
 * compiling and behaving as they did.
 */
export function blocksReply(
  day: 'today' | 'yesterday',
  blocks: readonly BlockLine[],
  answered: readonly string[] = [],
  /**
   * Where the student is in the fortnight, so this asks only about what has happened.
   *
   * Required, and for the reason `checkIn.ts` wrote down about its own clock: "an optional
   * clock is one a caller forgets to pass". Without it this asked about the first unanswered
   * block on the day whatever the hour -- an 8pm essay at 9am, or a block on a day still
   * ahead when `/day` was given a future index -- and recorded the answer as a measurement
   * of a block nobody had lived.
   */
  now: { readonly today: number; readonly hour: number },
  /** Ruling 24: set when this day was opened from the fortnight, so it replaces that message and
   *  offers a way back instead of stranding the student in a dead end. */
  nav: { readonly replacing: true } | undefined = undefined,
): Reply {
  const navigation = nav === undefined ? {} : { replaceMessage: true as const }
  const backRow = nav === undefined ? [] : [[{ label: '‹ The fortnight', data: 'back:schedule' }]]

  if (blocks.length === 0) {
    return {
      text: `Nothing was scheduled ${day}.`,
      ...navigation,
      ...(backRow.length === 0 ? {} : { buttons: backRow }),
    }
  }

  const listed = blocks.map((block) => `• ${clockOf(block.startHour)} ${shorten(block.title)}`)
  const heading = `${day === 'today' ? 'Today' : 'Yesterday'}:`
  // The same rule the today card applies, from the same place: a past day is askable, a
  // future one never is, and today only once the block has finished.
  const ask = blocks.find(
    (block) =>
      !answered.includes(block.id) &&
      hasHappened(block, now.today, now.hour),
  )

  // Everything on the day is already in the log, or has not happened yet. The list is still
  // worth sending -- they asked what was on it -- but there is nothing left to ask, and
  // inventing a question would record an answer about a block nobody has lived.
  if (ask === undefined) {
    // The way back travels with this branch too. Dropping it barely showed while the only
    // way in was a day where everything had already been answered, and became a dead end
    // the moment "nothing has happened yet" started reaching it -- which is most days
    // opened from the fortnight.
    return {
      text: [heading, '', ...listed].join('\n'),
      ...navigation,
      ...(backRow.length === 0 ? {} : { buttons: backRow }),
    }
  }

  return {
    text: [heading, '', ...listed, '', `Did ${shorten(ask.title)} happen?`].join('\n'),
    // §8b②'s four answers, matching the today card exactly: a student who answers in both
    // places must not meet two different questions.
    ...navigation,
    buttons: [
      [
        { label: "Didn't happen", data: blockAnswerData(ask, 'didnt') },
        { label: 'Took less', data: blockAnswerData(ask, 'less') },
        { label: 'About right', data: blockAnswerData(ask, 'right') },
        { label: 'Took longer', data: blockAnswerData(ask, 'longer') },
      ],
      ...backRow,
    ],
  }
}

/**
 * §7.9's "never punish a miss", and §1.3's mirror-not-scold rule.
 *
 * A student who did not do the thing is exactly the one whose data is most worth having,
 * and a comment on it is how they stop answering. So "didn't happen" reads the same as any
 * other answer.
 */
export const blockAnsweredReply = (_answer: BlockAnswer): Reply => ({
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
  /** The moved crossing as a student would say it, from `dayLabel` at the call site -- the
   *  raw index this used to print is the model's counting, not theirs. */
  deficitDayLabel: string | null,
  /** §2.3's provisional yes, when there is a stored ask for the button to accept. */
  askId?: string,
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
      ? ['', `It moves your first bad day to ${deficitDayLabel ?? 'earlier in the fortnight'}.`]
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
    /**
     * Still nothing that sends anything to anybody -- §2.3's rule is that the app does the
     * work of declining and the student keeps the decision, and copying a draft is how they
     * answer. What this adds writes only to their own week.
     *
     * §2.3's provisional yes is the mechanism the whole section is built on: saying yes is
     * reversible by default, and the commitment lapses on its own unless the reserve can
     * still hold it at review. Without a button, that mechanism existed in the app and was
     * unreachable from the door most students actually use.
     */
    ...(askId === undefined
      ? {}
      : { buttons: [[{ label: 'Take it on (for now)', data: `takeon:${askId}` }]] }),
  }
}

/** §2.3: reversible by default, and said so. The review day is the mechanism -- it lapses
 *  on its own unless the reserve can still hold it -- so the reply names the direction of
 *  effort rather than congratulating anybody for saying yes. */
export const takenOnReply = (): Reply => ({
  text: 'Taken on, for now. If your week cannot hold it by the review day it lapses on its own — I will tell you if that happens.',
})

/** §7.9: never punish a miss, and never make an answer feel like paperwork. */
export const checkedInReply = (): Reply => ({
  text: 'Noted.',
})

/** §8.1 scores a claim about a real date. Without one there is nothing to attach an answer
 *  to, and recording it against a day index would be recording it against a different day
 *  tomorrow. */
export const checkInUnavailableReply = (): Reply => ({
  text: 'I cannot place today inside your fortnight, so there is nothing to record this against yet. Open the app once and it will sort itself out.',
})

/** One line per day of the horizon. §1.5: a chat message has no colour, so the band is a
 *  word rather than a shade -- the same rule the week grid follows for a different reason. */
/** A phone keyboard cannot read twenty-one buttons on one line. Seven to a row makes each
 *  row a week, which is also how a fortnight is actually read. */
const DAYS_PER_ROW = 7

export function scheduleReply(
  cells: readonly {
    dayIndex: number
    date: string | null
    band: 'light' | 'busy' | 'heavy'
    deficit: boolean
    unconfirmed: boolean
  }[],
  /** Ruling 24: set when this is a step *back* from a day, so it replaces that message rather
   *  than leaving the day view behind as a dead menu. */
  nav: { readonly replacing: true } | undefined = undefined,
): Reply {
  const crossing = cells.find((cell) => cell.deficit)

  const rows = Array.from({ length: Math.ceil(cells.length / DAYS_PER_ROW) }, (_, row) =>
    cells.slice(row * DAYS_PER_ROW, (row + 1) * DAYS_PER_ROW).map((cell) => ({
      // §1.5 again: the marker is a glyph beside the number, not a colour, because a chat
      // message has none.
      label: `${cell.dayIndex}${cell.deficit ? '!' : ''}`,
      data: `open:${cell.dayIndex}`,
    })),
  )

  return {
    ...(nav === undefined ? {} : { replaceMessage: true as const }),
    buttons: rows,
    text: [
      'Your fortnight:',
      '',
      ...cells.map((cell) => {
        const marks = [cell.band, ...(cell.deficit ? ['deficit'] : []), ...(cell.unconfirmed ? ['unanswered'] : [])]
        return `${cell.date ?? `Day ${cell.dayIndex}`} — ${marks.join(', ')}`
      }),
      '',
      crossing === undefined
        ? 'It holds all the way through.'
        : `It stops holding on day ${crossing.dayIndex}.`,
    ].join('\n'),
  }
}

/** §8's five energy bands and four sleep buckets, in the same words and the same order the
 *  today card uses -- a student answering in both places must not meet two different
 *  questions (§8b②). The values live in `src/ui/today/checkIn` and `TodayCard`; these are
 *  the same numbers, and a test in `handle.test.ts` pins them together. */
const ENERGY_BANDS: readonly { label: string; value: number }[] = [
  { label: 'Running on empty', value: 10 },
  { label: 'Low', value: 30 },
  { label: 'Getting by', value: 50 },
  { label: 'Pretty good', value: 70 },
  { label: 'Full of it', value: 90 },
]

const SLEEP_BUCKETS: readonly { label: string; bucket: string }[] = [
  { label: 'Under 5 hours', bucket: 'under5' },
  { label: 'About 6', bucket: 'six' },
  { label: 'About 7', bucket: 'seven' },
  { label: '8 or 9', bucket: 'eightPlus' },
  { label: '10 or more', bucket: 'tenPlus' },
]

export function checkInReply(asking: 'energy' | 'sleep'): Reply {
  if (asking === 'sleep') {
    return {
      text: 'How much sleep last night?',
      buttons: [SLEEP_BUCKETS.map((entry) => ({ label: entry.label, data: `sleep:${entry.bucket}` }))],
    }
  }

  return {
    text: 'How is your energy today?',
    // Everything the answer needs travels in the callback, so nothing has to be remembered
    // between one message and the next.
    buttons: [ENERGY_BANDS.map((band) => ({ label: band.label, data: `energy:${band.value}` }))],
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
 * When there is no yesterday inside this week.
 *
 * Either the week predates anchoring and carries no date to count from, or it began today
 * so yesterday falls before it started. Answering with some other day would put wrong data
 * into the very table §2.4 will later trust.
 */
export const yesterdayUnavailableReply = (): Reply => ({
  text: 'This week does not go back that far, so there is nothing to look at. Use /today and I will go through today with you.',
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

/**
 * What to say when the evidence cannot be read.
 *
 * Its own line rather than reusing `askUnavailableReply`, which is about pricing a request
 * and would be answering a question nobody asked. Advice now depends on what the student
 * has confirmed they actually did, so with no block log there is no honest suggestion --
 * and guessing at one is exactly the silent-default fault Ruling 41 records.
 */
export const restUnavailableReply = (): Reply => ({
  text: 'I cannot tell what you have kept up with right now. The app can, in the room.',
})

export const photoTooBigReply = (): Reply => ({
  text: 'That image is larger than I can read. Send a smaller one, or type what is on it.',
})

/** §1.4's own stance: photo import has no fallback, because reading an image needs the
 *  model. Said plainly rather than pretending otherwise. */
export const photoUnavailableReply = (): Reply => ({
  text: 'I cannot read images right now. Type what is on it and I will read that the same way.',
})

/**
 * Ruling 22's parity renderers, and the rule they exist under.
 *
 * The bot never decides anything. Every figure below arrives already computed by
 * `src/domain` or `src/optimizer` -- the same functions the app's own screens read -- so
 * these keep the shape of the rest of this file: values in, a payload out, nothing sent and
 * nothing judged. A threshold comparison appearing in this file would mean a second model
 * of the same student, which is exactly what two renderers over one model avoids.
 */

/** Everything `/week` says, computed elsewhere. */
export interface WeekSummary {
  /** Overall reserve now, already rounded. */
  readonly reserve: number
  /**
   * The deficit crossing as a student would say it, or null when the fortnight holds.
   *
   * A finished phrase rather than a day index. This said "It stops holding on day 11", which
   * is the model's own counting -- and one short of what a student calls that day besides.
   * Naming a day needs the week's anchor, which a rendered reply has no access to, so the
   * caller supplies it through `dayLabel`.
   */
  readonly firstDeficitDayLabel: string | null
  /** §8.1's published accuracy sentence. */
  readonly accuracy: string
  /** §7.6's Reality Check line, or null when nothing measured is worth saying. */
  readonly bias: string | null
}

export function weekReply(summary: WeekSummary): Reply {
  const crossing =
    summary.firstDeficitDayLabel === null
      ? 'Your fortnight holds all the way through.'
      : `It stops holding on ${summary.firstDeficitDayLabel}.`

  return {
    text: [
      `You are at ${summary.reserve}%.`,
      crossing,
      '',
      summary.accuracy,
      // Omitted rather than hedged when there is nothing measured: §7.6 is only the
      // sharpest thing the app can say if every line on it is true.
      ...(summary.bias === null ? [] : [summary.bias]),
    ].join('\n'),
  }
}

/**
 * What the solver did, and the one move left when it could not help.
 *
 * `describeRebalance` already tells a healthy week with nothing to move from an overloaded
 * one with nothing that helps, so the fallback only ever adds to that report -- it never
 * contradicts it.
 */
/**
 * What a rebalance WOULD do, with the two buttons that decide it (Ruling 62).
 *
 * The app was changed to propose and wait (`c81da05`); this door went on saving the result
 * the moment the command arrived, so the same word rearranged a student's week behind them
 * in chat and asked first on screen. Ruling 16's rule -- never silently reshuffle -- is a property
 * of the product, not of the screen.
 */
export function rebalanceReply(
  report: string,
  fallback: string | null,
  fingerprint: string,
): Reply {
  const lines = [report]
  if (fallback !== null) lines.push('', `It would still cut into the deficit to ${fallback}.`)
  lines.push('', 'Nothing has changed yet.')

  return {
    text: lines.join('\n'),
    buttons: [
      [
        { label: 'Do it', data: `rebalance:apply:${fingerprint}` },
        { label: 'Leave it', data: 'rebalance:decline' },
      ],
    ],
  }
}

/** What the student sees when they approve a plan made for a week that has since moved on.
 *  Refused rather than applied: the moves were worked out against blocks that may no longer
 *  be where they were, and applying them anyway is the silent reshuffle Ruling 16 forbids. */
export const rebalanceStaleReply = (): Reply => ({
  text: 'Your week changed since I worked that out, so I have not touched it. Send /rebalance again for a fresh plan.',
})

/** The healthy default, said out loud so declining is an answer rather than silence. */
export const rebalanceDeclinedReply = (): Reply => ({
  text: 'Left as it is.',
})

/** Refused rather than clamped: a student who typed 40 and was shown day 20 would be
 *  reading a day they did not ask for, with no way to tell. */
export const needDayReply = (horizonDays: number): Reply => ({
  text: `Which day? Give me a number from 0 to ${horizonDays - 1}, like "/day 3".`,
})

/** §2.3's lapsed commitments: the provisional yes that quietly stopped being affordable. */
export function lapsedReply(commitments: readonly { title: string }[]): Reply {
  if (commitments.length === 0) {
    return { text: 'Nothing you said yes to has fallen through.' }
  }

  return {
    text: [
      'These were provisional, and your week no longer holds them:',
      '',
      ...commitments.map((commitment) => `• ${shorten(commitment.title)}`),
      '',
      'Nothing has been cancelled for you. Telling them is yours to do.',
    ].join('\n'),
  }
}
