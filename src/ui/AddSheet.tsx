import type { ParsedItem } from '../ai'
import type { BlockRecord } from '../domain/blockLog'
import type { EnergyPrediction } from '../domain/predictions'
import type { EngineParams } from '../engine'
import type { Schedule } from '../optimizer'
import type { AddWay } from './room/view'
import { Button } from './kit/Button'
import { Sheet } from './kit/Sheet'
import { suggestRepeat } from '../domain/recurrence'
import { beginConnect, readCalendar } from '../google/client'
import { CalendarImportScreen } from './planner/CalendarImportScreen'
import { calendarFor, dayLabelsFor } from './planner/dayLabels'
import { PhotoImportScreen } from './planner/PhotoImportScreen'
import { PlannerScreen } from './planner/PlannerScreen'
import { RequestBoxScreen } from './request/RequestBoxScreen'

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
/**
 * The ways in, each saying what it actually does.
 *
 * Ruling 58: these were centred labels and nothing else, so "Someone asked me for
 * something" had to carry the whole idea -- that the request is PRICED against the week
 * before you answer -- in six words, and could not.
 */
const WAYS_IN: readonly {
  readonly way: AddWay
  readonly testid: string
  readonly label: string
  readonly help: string
}[] = [
  {
    way: 'photo',
    testid: 'add-photo',
    label: 'Photograph something',
    help: 'A timetable, a whiteboard, a printed schedule.',
  },
  {
    way: 'type',
    testid: 'add-type',
    label: 'Type it out',
    help: 'Write it in your own words and I will read it back as blocks.',
  },
  {
    way: 'request',
    testid: 'add-request',
    label: 'Someone asked me for something',
    help: 'Priced against your week before you answer.',
  },
  {
    way: 'calendar',
    testid: 'add-calendar',
    label: 'From my Google Calendar',
    // Says what it will and will not do, because "sync" is the word people fear here. The
    // read half is one-way and nothing is added without the same confirm screen the other
    // ways use.
    help: 'Read this fortnight in. Nothing is added until you say so.',
  },
]

export function AddSheet({
  schedule,
  params,
  today,
  blockLog,
  predictions,
  onAcceptItems,
  onAcceptRequest,
  onClose,
  way,
  onWay,
  calendarConnected = false,
  onBack,
}: {
  readonly schedule: Schedule
  /** §2.4's calibrated params, threaded to the request path so it prices against the
   *  student's own numbers rather than the population default. */
  readonly params: EngineParams
  readonly today: number
  /** §6.5/§8b's check-in evidence, threaded to the request path so its price reflects the
   *  same silence-aware projection the room and the dial already show. */
  readonly blockLog: readonly BlockRecord[]
  /** §8.1's resolved predictions, forwarded to the request path so both rooms it draws run
   *  the model the rest of the app runs rather than the population one. */
  readonly predictions: readonly EnergyPrediction[]
  readonly onAcceptItems: (items: readonly ParsedItem[]) => void
  readonly onAcceptRequest: (item: ParsedItem) => void
  readonly onClose: () => void
  /** Which of the three ways is open, or null at the chooser. Held by the caller rather
   *  than here since Ruling 57: a sub-flow only this component knew about could not be
   *  written into the address, so `/add/photo` could not exist. */
  readonly way: AddWay | null
  readonly onWay: (way: AddWay | null) => void
  /**
   * Whether this student has already granted calendar access (§1.4's supplement).
   *
   * Defaulted to false so every caller written before the calendar way existed keeps
   * compiling and behaving as it did -- and so a build with no Google configuration offers
   * the connect step rather than pretending a connection already exists.
   */
  readonly calendarConnected?: boolean
  /** Ruling 60: one level up, from a sub-flow to the chooser. The chooser itself is given
   *  none -- it opens straight from the room, where Back and close would mean the same
   *  thing and two controls doing one job is how `Cancel` became ambiguous. */
  readonly onBack: () => void
}) {
  const close = () => onClose()

  /**
   * §43: computed once here rather than in each of the three screens.
   *
   * This is the only component in the add flow holding both the week and today, which is
   * what the labels need -- the screens below it take the finished list and hand it to the
   * chip.
   */
  const dayLabels = dayLabelsFor(schedule, today)
  /** §44: and the same week, said in the terms the two readers need. */
  const calendar = calendarFor(schedule, today)

  if (way === 'photo') {
    return (
      <PhotoImportScreen
        dayLabels={dayLabels}
        suggestRepeat={(item) => suggestRepeat(item, schedule)}
        onAccept={(items) => {
          onAcceptItems(items)
          close()
        }}
        onBack={onBack}
        onClose={close}
      />
    )
  }

  if (way === 'type') {
    return (
      <PlannerScreen
        dayLabels={dayLabels}
        calendar={calendar}
        suggestRepeat={(item) => suggestRepeat(item, schedule)}
        onAccept={(items) => {
          onAcceptItems(items)
          close()
        }}
        onBack={onBack}
        onClose={close}
      />
    )
  }

  if (way === 'calendar') {
    return (
      <CalendarImportScreen
        dayLabels={dayLabels}
        connected={calendarConnected}
        onConnect={() => void beginConnect()}
        onRead={() => readCalendar(schedule)}
        suggestRepeat={(item) => suggestRepeat(item, schedule)}
        onAccept={(items) => {
          onAcceptItems(items)
          close()
        }}
        onBack={onBack}
        onClose={close}
      />
    )
  }

  if (way === 'request') {
    return (
      <RequestBoxScreen
        dayLabels={dayLabels}
        calendar={calendar}
        schedule={schedule}
        params={params}
        today={today}
        blockLog={blockLog}
        predictions={predictions}
        onAccept={(item) => {
          onAcceptRequest(item)
          close()
        }}
        onBack={onBack}
        onClose={close}
      />
    )
  }

  return (
    <Sheet
      title="What's coming at you?"
      onClose={close}
    >
      <div className="flex flex-col gap-3">
        {WAYS_IN.map(({ way, testid, label, help }) => (
          <Button
            key={way}
            variant="secondary"
            data-testid={testid}
            onClick={() => onWay(way)}
            className="w-full justify-start text-left"
          >
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{label}</span>
              <span className="text-xs font-normal text-ink-soft">{help}</span>
            </span>
          </Button>
        ))}
      </div>
    </Sheet>
  )
}
