import { DISTRESS_RUN } from '../../domain/distress'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'

/**
 * What the app says when rescheduling has stopped being the relevant kind of help.
 *
 * Every other surface here treats a bad fortnight as a scheduling problem, because for
 * somebody overloaded it is one. This is the case that is not: the student has told the app
 * four days running that they are at the bottom, and a walk, a rebalance or a declined
 * request are not answers to that.
 *
 * Four rules the copy holds to, all of them load-bearing:
 *
 * It does not diagnose. The app knows what somebody typed into a five-button check-in; it
 * does not know what is wrong, and a scheduling tool guessing at that would be both wrong
 * and harmful. So it reflects what was said and stops there -- the same mirror-not-scold
 * stance §1.3 takes everywhere else, pointed at the one place it matters most.
 *
 * It does not alarm. No warning colour, no icon, no urgency. This uses the ordinary card
 * and the ordinary voice, because the message is "this is a normal thing that happens to
 * students and there is a normal thing to do about it", and dressing it as an emergency
 * would make it harder to act on rather than easier.
 *
 * It names no service it cannot verify. A wrong phone number in a card like this is worse
 * than no phone number, so it points at the student's own university -- which they can find
 * and which is true of every institution -- rather than inventing a hotline. A deployment
 * that knows its campus should replace this with the real contact.
 *
 * It takes nothing away. The card is dismissable and blocks nothing: a student in a bad
 * fortnight still gets their week, their gauge and their blocks. Removing the app's use to
 * make a point about wellbeing would just be a second thing going wrong for them.
 */
export function DistressCard({ onDismiss }: { readonly onDismiss: () => void }) {
  return (
    <Card role="region" aria-label="A note about how you have been" className="flex flex-col gap-3">
      <p className="text-base font-medium">
        You have said you are running low {DISTRESS_RUN} days in a row.
      </p>

      <p className="text-sm text-ink-soft">
        That is more than a busy week, and moving blocks around is not the thing that helps
        with it. Your university has a counselling service, and talking to someone there is
        an ordinary thing to do rather than a last resort.
      </p>

      <p className="text-sm text-ink-soft">
        Nothing here is going anywhere. The week will still be here afterwards.
      </p>

      <Button
        variant="quiet"
        size="sm"
        className="self-start"
        data-testid="distress-dismiss"
        onClick={onDismiss}
      >
        Thanks — not now
      </Button>
    </Card>
  )
}
