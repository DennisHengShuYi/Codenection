import { useState } from 'react'
import type { ParsedItem } from '../ai'
import type { BlockRecord } from '../domain/blockLog'
import type { EngineParams } from '../engine'
import type { Schedule } from '../optimizer'
import { Button } from './kit/Button'
import { Sheet } from './kit/Sheet'
import { PhotoImportScreen } from './planner/PhotoImportScreen'
import { PlannerScreen } from './planner/PlannerScreen'
import { RequestBoxScreen } from './request/RequestBoxScreen'

type AddWay = 'choose' | 'photo' | 'type' | 'request'

/**
 * §6's `+` sheet -- "photograph something · type it out · someone asked me for something".
 *
 * The insight the three paths share: something arrives, you confirm what it is, it becomes
 * blocks. A request is the same shape as a photo or a typed dump, priced first because it is
 * the one path where a student is deciding whether to say yes to someone else rather than
 * just recording what is already theirs.
 *
 * Replaces `AddSheetStub`, the interim Task 13 wired in while this had its own task. Each
 * of the three destination screens now owns its own `Sheet` (the same pattern `BlockSheet`
 * uses) because each screen's action bar depends on state -- `reading`, `working`, whether
 * there is anything to accept yet -- that only that screen holds. This component only owns
 * the `Sheet` for the choice itself.
 */
export function AddSheet({
  schedule,
  params,
  today,
  blockLog,
  onAcceptItems,
  onAcceptRequest,
  onClose,
}: {
  readonly schedule: Schedule
  /** §2.4's calibrated params, threaded to the request path so it prices against the
   *  student's own numbers rather than the population default. */
  readonly params: EngineParams
  readonly today: number
  /** §6.5/§8b's check-in evidence, threaded to the request path so its price reflects the
   *  same silence-aware projection the room and the dial already show. */
  readonly blockLog: readonly BlockRecord[]
  readonly onAcceptItems: (items: readonly ParsedItem[]) => void
  readonly onAcceptRequest: (item: ParsedItem) => void
  readonly onClose: () => void
}) {
  const [way, setWay] = useState<AddWay>('choose')

  const close = () => {
    setWay('choose')
    onClose()
  }

  const backToChoice = () => setWay('choose')

  if (way === 'photo') {
    return (
      <PhotoImportScreen
        onAccept={(items) => {
          onAcceptItems(items)
          close()
        }}
        onCancel={backToChoice}
      />
    )
  }

  if (way === 'type') {
    return (
      <PlannerScreen
        onAccept={(items) => {
          onAcceptItems(items)
          close()
        }}
        onCancel={backToChoice}
      />
    )
  }

  if (way === 'request') {
    return (
      <RequestBoxScreen
        schedule={schedule}
        params={params}
        today={today}
        blockLog={blockLog}
        onAccept={(item) => {
          onAcceptRequest(item)
          close()
        }}
        onCancel={backToChoice}
      />
    )
  }

  return (
    <Sheet
      title="What's coming at you?"
      onClose={close}
      actions={
        <Button variant="quiet" onClick={close}>
          Cancel
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Button variant="secondary" data-testid="add-photo" onClick={() => setWay('photo')}>
          Photograph something
        </Button>
        <Button variant="secondary" data-testid="add-type" onClick={() => setWay('type')}>
          Type it out
        </Button>
        <Button variant="secondary" data-testid="add-request" onClick={() => setWay('request')}>
          Someone asked me for something
        </Button>
      </div>
    </Sheet>
  )
}
