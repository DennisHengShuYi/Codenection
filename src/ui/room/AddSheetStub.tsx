import { useState } from 'react'
import type { ParsedItem } from '../../ai'
import type { Schedule } from '../../optimizer'
import { Button } from '../kit/Button'
import { Sheet } from '../kit/Sheet'
import { PhotoImportScreen } from '../planner/PhotoImportScreen'
import { PlannerScreen } from '../planner/PlannerScreen'
import { RequestBoxScreen } from '../request/RequestBoxScreen'

type AddWay = 'choose' | 'photo' | 'type' | 'request'

/**
 * §6's `+` sheet -- "photograph something · type it out · someone asked me for something".
 *
 * `AddSheet` proper is Task 14's job, with its own file and its own tests; this is exactly
 * the interim the task-13 brief names: "stub it as a `Sheet` with the three buttons wired
 * to the existing screens until then." Extracted out of `RoomShell.tsx` (rather than left
 * inline) per the combined 12+13 review's line-count finding -- a mechanical move, no
 * behaviour change.
 */
export function AddSheetStub({
  schedule,
  onAcceptItems,
  onAcceptRequest,
  onClose,
}: {
  readonly schedule: Schedule
  readonly onAcceptItems: (items: readonly ParsedItem[]) => void
  readonly onAcceptRequest: (item: ParsedItem) => void
  readonly onClose: () => void
}) {
  const [way, setWay] = useState<AddWay>('choose')

  const close = () => {
    setWay('choose')
    onClose()
  }

  return (
    <Sheet title="What's coming at you?" onClose={close}>
      {way === 'choose' && (
        <div className="flex flex-col gap-3">
          <Button data-testid="add-photo" onClick={() => setWay('photo')}>
            Photograph something
          </Button>
          <Button data-testid="add-type" onClick={() => setWay('type')}>
            Type it out
          </Button>
          <Button data-testid="add-request" onClick={() => setWay('request')}>
            Someone asked me for something
          </Button>
        </div>
      )}

      {way === 'photo' && (
        <PhotoImportScreen
          onAccept={(items) => {
            onAcceptItems(items)
            close()
          }}
          onCancel={() => setWay('choose')}
        />
      )}

      {way === 'type' && (
        <PlannerScreen
          onAccept={(items) => {
            onAcceptItems(items)
            close()
          }}
          onCancel={() => setWay('choose')}
        />
      )}

      {way === 'request' && (
        <RequestBoxScreen
          schedule={schedule}
          onAccept={(item) => {
            onAcceptRequest(item)
            close()
          }}
          onCancel={() => setWay('choose')}
        />
      )}
    </Sheet>
  )
}
