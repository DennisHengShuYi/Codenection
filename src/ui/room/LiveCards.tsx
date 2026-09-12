import type { MicroStart } from '../../domain/microStart'
import type { ScheduledItem } from '../../optimizer'
import type { SleepBucket } from '../today/checkIn'
import { DistressCard } from '../distress/DistressCard'
import { OverfullCard } from '../overfull/OverfullCard'
import { MicroStartCard } from '../microStart/MicroStartCard'
import { TodayCard } from '../today/TodayCard'
import type { CardId } from './cardPrecedence'

/**
 * §3's card precedence, rendered. Extracted out of `RoomShell.tsx` per the combined 12+13
 * review's line-count finding -- a mechanical move: every prop here is data or a callback
 * `RoomShell` already computed, nothing is recomputed here.
 */
export function LiveCards({
  cards,
  onDistressDismiss,
  overfullDayLabel,
  overfullCandidates,
  overfullDropped,
  onOverfullDrop,
  onOverfullDismiss,
  stuckMicroStart,
  stuckTitle,
  onStuckStart,
  onStuckDismiss,
  askEnergy,
  askSleep,
  sleepRealityLine,
  plannedLastNight,
  onEnergy,
  onSleep,
  onTodayDismiss,
}: {
  readonly cards: readonly CardId[]
  readonly onDistressDismiss: () => void
  /** Already in words, from `domain/calendar.dayLabel`. */
  readonly overfullDayLabel: string
  readonly overfullCandidates: readonly ScheduledItem[]
  /** What was just dropped, when it was a provisional yes. Null otherwise. */
  readonly overfullDropped: string | null
  readonly onOverfullDrop: (itemId: string) => void
  readonly onOverfullDismiss: () => void
  readonly stuckMicroStart: MicroStart | null
  /** What the student called the block the card is about, so it names the work and not just
   *  the move. Empty when there is no stuck block, which is when the card renders nothing. */
  readonly stuckTitle: string
  readonly onStuckStart: () => void
  readonly onStuckDismiss: () => void
  readonly askEnergy: boolean
  readonly askSleep: boolean
  /** §7.6's Reality Check for sleep, forwarded to `TodayCard`. Optional for the same
   *  no-cold-start reason `outcomes` is. */
  readonly sleepRealityLine?: string | null
  /** What the week planned for the night the card is asking about, forwarded to
   *  `TodayCard`. Optional for the same no-cold-start reason `outcomes` is. */
  readonly plannedLastNight?: number | null
  readonly onEnergy: (energy: number) => void
  readonly onSleep: (bucket: SleepBucket) => void
  readonly onTodayDismiss: () => void
}) {
  const renderCard = (id: CardId) => {
    switch (id) {
      case 'distress':
        return <DistressCard key="distress" onDismiss={onDistressDismiss} />
      case 'overfull':
        return (
          <OverfullCard
            key="overfull"
            dayLabel={overfullDayLabel}
            candidates={overfullCandidates}
            droppedTitle={overfullDropped}
            onDrop={onOverfullDrop}
            onDismiss={onOverfullDismiss}
          />
        )
      case 'stuck':
        return (
          <MicroStartCard
            key="stuck"
            microStart={stuckMicroStart}
            title={stuckTitle}
            onStarted={onStuckStart}
            onDismiss={onStuckDismiss}
          />
        )
      case 'today':
        return (
          <TodayCard
            key="today"
            askEnergy={askEnergy}
            askSleep={askSleep}
            sleepRealityLine={sleepRealityLine}
            plannedLastNight={plannedLastNight}
            onEnergy={onEnergy}
            onSleep={onSleep}
            onDismiss={onTodayDismiss}
          />
        )
    }
  }

  return <>{cards.map(renderCard)}</>
}
