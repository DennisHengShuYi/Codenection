import { useState, type JSX } from 'react'
import { IN_THEIR_WORDS } from '../../domain/realityCheck'
import type { BlockAnswer } from '../../domain/blockLog'
import { Button, type ButtonVariant } from '../kit/Button'
import { hourLabel } from '../kit/labels'
import { Sheet } from '../kit/Sheet'
import type { BlockAction, BlockSheetModel } from './blockActions'

/**
 * §5: the one panel every block opens onto, showing whichever of its states apply.
 *
 * `blockSheet` (Task 7) already decided which actions a given block offers -- this component
 * renders exactly that set and nothing else. A sheet that rendered every action unconditionally
 * would be the defect the model exists to prevent: Later on a block already in the past.
 */

const CONFIRM_LABELS: Record<BlockAnswer, string> = {
  didnt: "Didn't happen",
  less: 'Took less',
  right: 'About right',
  longer: 'Took longer',
}

/**
 * The three answers this sheet asks for, and deliberately not four.
 *
 * "Didn't happen" was doing the same job as Remove one row below it -- a student looking at
 * a block that did not happen has two buttons for it -- so the question here is narrowed to
 * the one thing Reality Check reads: how long it took. `didnt` remains a `BlockAnswer` and
 * is still written by the today card, by the bot, and by "I didn't" on a rest block, because
 * `softDeadlines` reads it: a skipped rest must not satisfy the rest rhythm.
 */
const CONFIRM_ORDER: readonly BlockAnswer[] = ['less', 'right', 'longer']

const SIMPLE_LABELS = {
  later: 'Later',
} as const

type SimpleAction = keyof typeof SIMPLE_LABELS

const isSimpleAction = (action: BlockAction): action is SimpleAction => action === 'later'

/**
 * The line under the title: when the block runs, what it spends, and how long for.
 *
 * The load type is dropped on a rest block. Every rest block the app creates carries
 * `type: 'mental'` as a placeholder -- `drain.ts` excludes rest from draining, so nothing
 * ever spends it -- and this was the only line that read the placeholder, which made a rest
 * block introduce itself as "study and writing". Its kind is its description, and the title
 * above already says Rest.
 */
const whenText = (item: BlockSheetModel['item']): string => {
  const when = `${hourLabel(item.startHour)}–${hourLabel(item.startHour + item.hours)}`
  const spends = item.protectedRest ? null : IN_THEIR_WORDS[item.type]
  const long = `${item.hours} ${item.hours === 1 ? 'hour' : 'hours'}`

  return [when, spends, long].filter((part) => part !== null).join(' · ')
}

export function BlockSheet({
  model,
  onClose,
  onBack,
  onLater,
  onConfirm,
  onRested,
  onEdit,
  onRemove,
  onMicroStart,
}: {
  readonly model: BlockSheetModel
  readonly onClose: () => void
  /** Ruling 60: one level up, to the week this block was opened from. `onClose` means done
   *  entirely, and goes to the room. */
  readonly onBack: () => void
  readonly onLater: (itemId: string) => void
  readonly onConfirm: (itemId: string, answer: BlockAnswer) => void
  readonly onRested: (itemId: string, rested: boolean) => void
  /** Opens the day/time form on this block. */
  readonly onEdit: (itemId: string) => void
  /** Takes the block out of the week. Called only after the confirmation below. */
  readonly onRemove: (itemId: string) => void
  /** §4.1's manual trigger: opens the ladder for this block on a page of its own. */
  readonly onMicroStart: (itemId: string) => void
}): JSX.Element {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const { item, actions, recordedAnswer } = model

  const simpleHandlers: Record<SimpleAction, (itemId: string) => void> = {
    later: onLater,
  }

  const simpleActions = actions.filter(isSimpleAction)

  const actionBar = (
    <>
      {simpleActions.map((action, index) => {
        const variant: ButtonVariant = index === 0 ? 'primary' : 'secondary'
        return (
          <Button key={action} variant={variant} onClick={() => simpleHandlers[action](item.id)}>
            {SIMPLE_LABELS[action]}
          </Button>
        )
      })}

      {/*
        What happened, on a line of its own.

        `order-first` with a full-width basis puts it above Back and the three buttons that
        change the block, rather than in a wrapped row with them. They are different kinds of
        act -- one reports on the past, the others edit the plan -- and mixed into one row a
        student picked "Edit" out of a line that began "Took less".
      */}
      {actions.includes('confirm') && (
        <div
          data-testid="answer-row"
          className="order-first flex w-full flex-wrap items-center justify-end gap-2"
        >
          {CONFIRM_ORDER.map((answer) => (
            <Button
              key={answer}
              variant="secondary"
              data-testid={`answer-${answer}`}
              onClick={() => onConfirm(item.id, answer)}
            >
              {CONFIRM_LABELS[answer]}
            </Button>
          ))}
        </div>
      )}

      {/* Rest's own question, in the same place on the sheet, so every block reads the same
          shape however it is answered. */}
      {actions.includes('didRest') && (
        <div
          data-testid="answer-row"
          className="order-first flex w-full flex-wrap items-center justify-end gap-2"
        >
          <Button variant="secondary" data-testid="rested-yes" onClick={() => onRested(item.id, true)}>
            I rested
          </Button>
          <Button variant="secondary" data-testid="rested-no" onClick={() => onRested(item.id, false)}>
            I didn't
          </Button>
        </div>
      )}

      {/* §4.1's manual trigger, and now on every block. It asks for no explanation, which
          is the whole point: being asked why you are stuck is one more thing to be stuck
          on. */}
      {actions.includes('microStart') && (
        <Button variant="secondary" data-testid="micro-start" onClick={() => onMicroStart(item.id)}>
          Micro start
        </Button>
      )}

      {actions.includes('edit') && (
        <Button variant="secondary" data-testid="edit-block" onClick={() => onEdit(item.id)}>
          Edit
        </Button>
      )}

      {/* Quiet, and last. Removing is the only thing on this sheet that cannot be taken
          back, so it should not sit where a thumb reaching for Done finds it first. */}
      {actions.includes('remove') && (
        <Button variant="quiet" data-testid="remove-block" onClick={() => setConfirmingRemove(true)}>
          Remove
        </Button>
      )}
    </>
  )

  /**
   * Removing is the one action here that cannot be undone.
   *
   * Done and Later change a block, and an answer can be given again. This takes the block
   * out of the week and there is no operation to put it back, so the question IS the
   * safeguard -- which is why it names the block rather than asking "are you sure?" about
   * nothing in particular. It replaces the body as well as the bar, so there is no way to
   * answer it by accident while looking at something else.
   */
  if (confirmingRemove) {
    return (
      <Sheet
        title={item.title}
        onClose={onClose}
        onBack={() => setConfirmingRemove(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingRemove(false)}>
              Keep it
            </Button>
            <Button data-testid="confirm-remove-yes" onClick={() => onRemove(item.id)}>
              Remove
            </Button>
          </>
        }
      >
        <p data-testid="confirm-remove">
          Remove {item.title}? This takes it out of your week, and I cannot put it back.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet title={item.title} onClose={onClose} onBack={onBack} actions={actionBar}>
      <p data-testid="block-when">{whenText(item)}</p>

      {/*
        §5's table calls this "what you recorded, and Undo" -- but `recordBlockAnswer` only
        upserts, so there is no way to actually retract an answer yet. Rather than offer a
        button that produces no visible change (indistinguishable from broken, caught at the
        combined 12+13 review), this states what was said. Honest, more informative than a
        dead control, and needs no new storage capability.
      */}
      {actions.includes('undo') && (
        <p data-testid="recorded-answer" className="mt-2 text-sm">
          {recordedAnswer === null
            ? 'You already answered this.'
            : `You said: ${CONFIRM_LABELS[recordedAnswer]}`}
        </p>
      )}
    </Sheet>
  )
}
