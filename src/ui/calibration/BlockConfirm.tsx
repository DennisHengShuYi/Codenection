import { useState } from 'react'
import type { ScheduledItem } from '../../optimizer'

export type Happened = 'yes' | 'no' | 'partly'
export type Difficulty = 'easier' | 'expected' | 'harder'

/**
 * §7.9: the single highest value-per-effort input path in the app.
 *
 * One prompt, two taps, feeding three separate parameters -- Reality Check's planned versus
 * actual (§2.4), the carryover matrix's difficulty rating (§6.6), and the Micro-Start
 * trigger, since a block that repeatedly returns "no" is a stuck task (§4.1).
 *
 * **Never punish a miss.** "No" is a neutral answer that feeds the model, not a failure the
 * app comments on. A student who did not do the thing is exactly the one whose data is most
 * needed, and an app that makes them feel judged is one they stop answering. There is a test
 * asserting the copy contains no reproach.
 *
 * It can also be dismissed without answering: a prompt somebody cannot escape is one they
 * learn to dread, and then to ignore.
 */
export function BlockConfirm({
  block,
  onAnswer,
  onDismiss,
}: {
  block: ScheduledItem | null
  onAnswer: (happened: Happened, difficulty: Difficulty) => void
  onDismiss: () => void
}) {
  const [happened, setHappened] = useState<Happened | null>(null)

  if (block === null) return null

  return (
    <section
      data-testid="block-confirm"
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-4"
    >
      <div>
        <h2 className="text-base font-medium">{block.title}</h2>
        <p className="text-sm opacity-70">Did this happen?</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['yes', 'partly', 'no'] as const).map((answer) => (
          <button
            key={answer}
            type="button"
            data-testid={`happened-${answer}`}
            onClick={() => setHappened(answer)}
            aria-pressed={happened === answer}
            className={`rounded-lg border px-4 py-2 text-sm ${
              happened === answer ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300'
            }`}
          >
            {answer === 'yes' ? 'Yes' : answer === 'partly' ? 'Partly' : 'No'}
          </button>
        ))}
      </div>

      {/* §7.9: the difficulty rating rides on the same prompt -- one additional tap, taken at
          completion when recall is perfect, rather than a second screen. */}
      {happened !== null && (
        <div className="flex flex-col gap-2">
          <p className="text-sm">How did it go?</p>
          <div className="flex flex-wrap gap-2">
            {(['easier', 'expected', 'harder'] as const).map((difficulty) => (
              <button
                key={difficulty}
                type="button"
                data-testid={`difficulty-${difficulty}`}
                onClick={() => onAnswer(happened, difficulty)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                {difficulty === 'easier'
                  ? 'Easier than expected'
                  : difficulty === 'expected'
                    ? 'About as expected'
                    : 'Harder than expected'}
              </button>
            ))}
          </div>
        </div>
      )}

      <button type="button" onClick={onDismiss} className="self-start text-sm underline">
        Not now
      </button>
    </section>
  )
}
