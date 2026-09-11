import type { Commitment } from '../../optimizer'
import type { MicroStart } from '../../domain/microStart'
import type { ScheduledItem } from '../../optimizer'
import type { SleepBucket } from '../today/checkIn'
import { DistressCard } from '../distress/DistressCard'
import { LapsedNotice } from '../request/LapsedNotice'
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
  lapsedCommitments,
  onLapsedDismiss,
  stuckMicroStart,
  onStuckStart,
  onStuckDismiss,
  blockForToday,
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
  readonly lapsedCommitments: readonly Commitment[]
  readonly onLapsedDismiss: () => void
  readonly stuckMicroStart: MicroStart | null
  readonly onStuckStart: () => void
  readonly onStuckDismiss: () => void
  readonly blockForToday: ScheduledItem | null
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
      case 'lapsed':
        return <LapsedNotice key="lapsed" commitments={lapsedCommitments} onDismiss={onLapsedDismiss} />
      case 'stuck':
        return stuckMicroStart === null ? null : (
          <MicroStartCard
            key="stuck"
            microStart={stuckMicroStart}
            onStarted={onStuckStart}
            onDismiss={onStuckDismiss}
          />
        )
      case 'today':
        return (
          <TodayCard
            key="today"
            block={blockForToday}
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
