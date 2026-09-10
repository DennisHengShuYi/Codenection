import type { BlockAnswer } from '../../domain/blockLog'
import type { Commitment } from '../../optimizer'
import type { Prescription as PrescriptionData } from '../../domain/prescribe'
import type { MicroStart } from '../../domain/microStart'
import type { ScheduledItem } from '../../optimizer'
import type { SleepBucket } from '../today/checkIn'
import { Prescription } from '../recovery/Prescription'
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
  recoveryPrescription,
  onRecoveryAccept,
  onRecoveryDismiss,
  lapsedCommitments,
  onLapsedDismiss,
  stuckMicroStart,
  onStuckStart,
  onStuckDismiss,
  blockForToday,
  askEnergy,
  askSleep,
  onEnergy,
  onSleep,
  onBlockAnswer,
  onTodayDismiss,
}: {
  readonly cards: readonly CardId[]
  readonly recoveryPrescription: PrescriptionData | null
  readonly onRecoveryAccept: (taken: PrescriptionData) => void
  readonly onRecoveryDismiss: (taken: PrescriptionData) => void
  readonly lapsedCommitments: readonly Commitment[]
  readonly onLapsedDismiss: () => void
  readonly stuckMicroStart: MicroStart | null
  readonly onStuckStart: () => void
  readonly onStuckDismiss: () => void
  readonly blockForToday: ScheduledItem | null
  readonly askEnergy: boolean
  readonly askSleep: boolean
  readonly onEnergy: (energy: number) => void
  readonly onSleep: (bucket: SleepBucket) => void
  readonly onBlockAnswer: (itemId: string, answer: BlockAnswer) => void
  readonly onTodayDismiss: () => void
}) {
  const renderCard = (id: CardId) => {
    switch (id) {
      case 'recovery':
        return (
          <Prescription
            key="recovery"
            prescription={recoveryPrescription}
            onAccept={onRecoveryAccept}
            onDismiss={onRecoveryDismiss}
          />
        )
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
            onEnergy={onEnergy}
            onSleep={onSleep}
            onBlock={onBlockAnswer}
            onDismiss={onTodayDismiss}
          />
        )
    }
  }

  return <>{cards.map(renderCard)}</>
}
