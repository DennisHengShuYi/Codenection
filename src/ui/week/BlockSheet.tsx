import { useState, type JSX } from 'react'
import { firstAction, type MicroStart } from '../../domain/microStart'
import { IN_THEIR_WORDS } from '../../domain/realityCheck'
import type { BlockAnswer } from '../../domain/blockLog'
import { Button, type ButtonVariant } from '../kit/Button'
import { Card } from '../kit/Card'
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

const CONFIRM_ORDER: readonly BlockAnswer[] = ['didnt', 'less', 'right', 'longer']

const SIMPLE_LABELS = {
  done: 'Done',
  later: 'Later',
} as const

type SimpleAction = keyof typeof SIMPLE_LABELS

const isSimpleAction = (action: BlockAction): action is SimpleAction =>
  action === 'done' || action === 'later'

const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

const whenText = (item: BlockSheetModel['item']): string =>
  `${formatHour(item.startHour)}–${formatHour(item.startHour + item.hours)} · ${IN_THEIR_WORDS[item.type]} · ${item.hours} hours`

function MicroStartCard({ microStart }: { readonly microStart: MicroStart }): JSX.Element {
  return (
    <Card tone="calm" data-testid="micro-start" className="mt-4">
      <p>{microStart.action}</p>
      <p>{microStart.minutes} minutes. That is the whole ask.</p>
    </Card>
  )
}

export function BlockSheet({
  model,
  onClose,
  onBack,
  onDone,
  onLater,
  onConfirm,
  onRested,
}: {
  readonly model: BlockSheetModel
  readonly onClose: () => void
  /** Ruling 60: one level up, to the week this block was opened from. `onClose` means done
   *  entirely, and goes to the room. */
  readonly onBack: () => void
  readonly onDone: (itemId: string) => void
  readonly onLater: (itemId: string) => void
  readonly onConfirm: (itemId: string, answer: BlockAnswer) => void
  readonly onRested: (itemId: string, rested: boolean) => void
}): JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const { item, actions, microStart: given, recordedAnswer } = model

  // §4.1's manual trigger: "I can't start this" reveals a first move even for a block the
  // domain has not (yet) called stuck. A block already flagged stuck arrives with `given` set
  // and is shown unasked -- clicking here would have nothing new to add.
  const microStart = given ?? (revealed ? firstAction(item) : null)

  const simpleHandlers: Record<SimpleAction, (itemId: string) => void> = {
    done: onDone,
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

      {actions.includes('confirm') &&
        CONFIRM_ORDER.map((answer) => (
          <Button
            key={answer}
            variant="secondary"
            data-testid={`answer-${answer}`}
            onClick={() => onConfirm(item.id, answer)}
          >
            {CONFIRM_LABELS[answer]}
          </Button>
        ))}

      {actions.includes('didRest') && (
        <>
          <Button variant="secondary" data-testid="rested-yes" onClick={() => onRested(item.id, true)}>
            I rested
          </Button>
          <Button variant="secondary" data-testid="rested-no" onClick={() => onRested(item.id, false)}>
            I didn't
          </Button>
        </>
      )}

      {actions.includes('cantStart') && (
        <Button variant="quiet" onClick={() => setRevealed(true)}>
          I can't start this
        </Button>
      )}
    </>
  )

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

      {microStart !== null && <MicroStartCard microStart={microStart} />}
    </Sheet>
  )
}
