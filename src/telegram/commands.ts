/**
 * The bot's commands.
 *
 * A command surface exists because seven flows have to be told apart, and some of them are
 * genuinely ambiguous from the words alone. "can you cover my shift saturday" and "cover
 * shift saturday" are the same sentence to a parser, but one wants pricing and the other
 * wants adding -- so the request flow gets `/ask` rather than a guess.
 *
 * A plain message stays a brain dump. That is the commonest thing a student sends, and it
 * must not need ceremony.
 */
export const COMMANDS = [
  'week',
  'day',
  'today',
  'yesterday',
  'rest',
  'stuck',
  'ask',
  'rebalance',
  'lapsed',
  'help',
] as const

export type CommandName = (typeof COMMANDS)[number]

export interface Command {
  readonly name: CommandName
  /** Everything after the command, as written. Empty when there was none, which is an
   *  ordinary case rather than a failure -- `/today` never has one. */
  readonly argument: string
}

const isCommand = (value: string): value is CommandName =>
  (COMMANDS as readonly string[]).includes(value)

/**
 * The command a message carries, or null.
 *
 * Null for anything unrecognised, so the caller can answer with help rather than guess:
 * guessing which command somebody meant is how a bot does the wrong thing confidently.
 *
 * `/start` deliberately returns null too. It belongs to linking, and `readStartCode`
 * handles it -- swallowing it here would answer a linking attempt with a help message.
 */
export function readCommand(text: string): Command | null {
  // Only a message that *begins* with a slash. "and/or" mid-sentence is not a command.
  const match = /^\/([a-z]+)(?:@\S+)?(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (match === null) return null

  const name = (match[1] ?? '').toLowerCase()
  if (!isCommand(name)) return null

  return { name, argument: (match[2] ?? '').trim() }
}
