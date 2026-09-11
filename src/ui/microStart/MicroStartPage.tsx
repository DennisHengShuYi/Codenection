import { useEffect, useState, type JSX } from 'react'
import { advance, currentRung, isComplete, type Ladder } from '../../domain/ladder'
import type { ScheduledItem } from '../../optimizer'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'

/**
 * §4.1's micro-start, as a page.
 *
 * The chain exists in full and exactly one rung is ever on screen. That is the whole of the
 * amendment to §4.1 recorded in this feature's design: the prohibition on a list was against
 * *choosing*, and a chain that reveals its next rung only when the current one is ticked
 * never asks anybody to choose. A wall of unticked boxes would also read as proof of how
 * much is left, which is the last thing somebody stuck needs shown to them.
 *
 * A page rather than a card in the block sheet, for the same reason `rebalance` is a door:
 * nothing else is in view. Somebody who cannot start a task is not helped by the task
 * sitting behind a panel explaining how to start it.
 */
export function MicroStartPage({
  item,
  ladder,
  ready = true,
  onLadder,
  onDone,
  onBack,
  onClose,
}: {
  readonly item: ScheduledItem
  /** The stored chain for this block, or null when it has never been opened. */
  readonly ladder: Ladder | null
  /**
   * Whether storage has answered about `ladder` yet. False means "not known", which is not
   * the same fact as null's "there is none".
   *
   * Without the distinction this page generated a fresh chain during the gap and wrote it
   * over the stored one, discarding the student's progress on every cold open of a
   * micro-start address. Defaulted to true so a caller holding a chain already -- every test
   * that passes one directly -- need not say so.
   */
  readonly ready?: boolean
  readonly onLadder: (ladder: Ladder) => void
  readonly onDone: (itemId: string) => void
  readonly onBack: () => void
  readonly onClose: () => void
}): JSX.Element {
  /**
   * The chain this page has moved on to, or null while the stored one still stands.
   *
   * Not seeded from `ladder`, because on a cold open `ladder` is still null when this
   * component mounts and a `useState` initialiser runs exactly once -- the stored chain would
   * arrive a tick later and never reach the screen. `open` below reads through to the prop
   * instead, so a late arrival shows up and a local advance still wins over it.
   */
  const [built, setBuilt] = useState<Ladder | null>(null)
  const [rerolling, setRerolling] = useState(false)

  useEffect(() => {
    // A stored chain is resumed rather than regenerated. Coming back to different words for
    // the step you had already decided to do is a small betrayal of somebody who came back.
    //
    // `ready` is the other half of that promise: generating before storage has answered
    // would overwrite a chain that exists but has not arrived yet, which is worse than
    // regenerating -- it destroys the record rather than ignoring it.
    if (!ready || ladder !== null) return undefined

    let cancelled = false

    // Loaded on demand, matching `PlannerScreen` and `RequestBoxScreen`. A static import
    // here pulls the whole `ai` module -- zod, every schema, every parser -- into the main
    // bundle for a page most opens never reach, and the build says so out loud.
    void import('../../ai')
      .then(({ buildLadder }) => buildLadder(item))
      .then((outcome) => {
        if (cancelled) return

        setBuilt(outcome.ladder)
        onLadder(outcome.ladder)
      })

    return () => {
      cancelled = true
    }
    // `onLadder` is deliberately absent from the dependencies: the shell recreates it on
    // every render, and depending on it would regenerate the chain in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, ladder, ready])

  const commit = (next: Ladder) => {
    setBuilt(next)
    onLadder(next)
  }

  const open = built ?? ladder
  /**
   * Whether the re-roll is worth offering.
   *
   * Read off the chain rather than held in state, so it survives a reload: without a model
   * `replaceRung` hands back the rung already on screen, and a button that visibly does
   * nothing is worse than one that is not there -- but a button that vanishes on reload is
   * worse still, because the student saw it work.
   */
  const fromModel = open?.fromModel === true
  const rung = open === null ? null : currentRung(open)
  const finished = open !== null && isComplete(open)

  const actions = (
    <>
      {open !== null && rung !== null && <Button onClick={() => commit(advance(open))}>Done — next step</Button>}

      {finished && (
        <Button data-testid="finish-block" onClick={() => onDone(item.id)}>
          Mark it done
        </Button>
      )}

      {open !== null && rung !== null && fromModel && (
        <Button
          variant="secondary"
          disabled={rerolling}
          onClick={() => {
            setRerolling(true)
            void import('../../ai')
              .then(({ replaceRung }) => replaceRung(item, open))
              .then(commit)
              .finally(() => setRerolling(false))
          }}
        >
          That one doesn&apos;t fit
        </Button>
      )}

      {/* Leaving is not failing, and nothing here says otherwise. Progress is already
          stored, so this is a way out rather than a way to lose what was done. */}
      <Button variant="quiet" onClick={onBack}>
        Stop here. That&apos;s enough.
      </Button>
    </>
  )

  return (
    <Sheet title={item.title} onClose={onClose} onBack={onBack} actions={actions}>
      {open === null && <p data-testid="ladder-working">Working out where to start.</p>}

      {open !== null && rung !== null && (
        <>
          <p data-testid="ladder-progress" className="text-sm text-ink-soft">
            Step {open.done + 1} of {open.rungs.length}
          </p>
          <p data-testid="rung-action" className="mt-2 text-lg">
            {rung.action}
          </p>
          <p data-testid="rung-minutes" className="mt-2 text-sm text-ink-soft">
            {rung.minutes} minutes. That is the whole ask.
          </p>
        </>
      )}

      {finished && (
        <p data-testid="ladder-finished">
          That is all of it. Whether or not the block is finished, you started — which was the
          part that was not happening.
        </p>
      )}
    </Sheet>
  )
}
