/**
 * Whether the fortnight's answer has changed enough to interrupt somebody for.
 *
 * §26: this is the one capability the PWA does not have. Web push on iOS is unreliable and
 * needs the app installed; Telegram always delivers. But a bot that messages daily is one a
 * student mutes within a week, and a muted bot is worse than no bot -- so the bar is not
 * "something changed", it is "the answer to the question they care about changed".
 *
 * The question is: does my fortnight hold. There are exactly two transitions worth a
 * message. It held and now it does not, which is the notification that justifies the whole
 * channel. And it did not hold and now it does, which matters because a channel that only
 * ever brings bad news is one people learn to dread.
 *
 * Deliberately silent on a deficit day that merely moved. A week underwater on day 4 and a
 * week underwater on day 9 are the same answer to the same question, and messaging on the
 * difference would mean a notification most days -- which is exactly how this stops being
 * worth having.
 *
 * @param previous what was last reported to this student, or `undefined` when nothing ever
 * has been. The first run says nothing at all: a student should not be greeted by a crisis
 * message the first time a cron happens to run, about a week they have not touched.
 */
export function crossingNotice(
  previous: number | null | undefined,
  current: number | null,
): string | null {
  if (previous === undefined) return null
  if (previous === current) return null

  if (current === null) {
    return 'Your fortnight holds again. Whatever you changed, it worked.'
  }

  if (previous === null) {
    return [
      'Your fortnight just crossed the line.',
      '',
      `You were clear through to the end this morning. Now it stops holding on day ${current}.`,
    ].join('\n')
  }

  // Both underwater. Only worth saying when it got closer, and even then only because the
  // day itself is what a student plans around.
  return current < previous
    ? `Your fortnight now stops holding on day ${current}, earlier than the day ${previous} it was.`
    : null
}
