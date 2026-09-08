
# §2.5 degrees of freedom

Measured on a realistic UM final-year fortnight, before any rebalance UI exists.

## Ordinary fortnight

| Measure | Value |
|---|---|
| Items in the schedule | 48 |
| Of those, movable | 21 |
| Legal single moves available | 118 |
| &nbsp;&nbsp;`batchErrands` | 12 |
| &nbsp;&nbsp;`insertRest` | 11 |
| &nbsp;&nbsp;`reorderWithinDay` | 32 |
| &nbsp;&nbsp;`shiftDay` | 63 |
| Starting headline reserve | 58.8 |
| Starting floor reserve | 45.0 |
| Worst floor before | 41.7 |
| Worst floor after | 48.0 |
| Deficit days before | 0 |
| Deficit days after | 0 |
| Deficit area before | 0 |
| Deficit area after | 0 |
| First deficit crossing | none |
| Moves the search took | 2 |
| &nbsp;&nbsp;taken: `insertRest` | 1 |
| &nbsp;&nbsp;taken: `shiftDay` | 1 |

What the app would say:

> I moved 1 thing and added 1 rest block. Your worst day goes from 42 to 48.

Smallest fixes (§2.2):

- Added a rest block on day 0: worst day 41.7 → 46.4
- Moved Dinner with housemates 2 days earlier: worst day 41.7 → 45.7
- Moved Dinner with housemates 1 day earlier: worst day 41.7 → 43.3

## Crunch fortnight

| Measure | Value |
|---|---|
| Items in the schedule | 51 |
| Of those, movable | 24 |
| Legal single moves available | 124 |
| &nbsp;&nbsp;`batchErrands` | 12 |
| &nbsp;&nbsp;`insertRest` | 10 |
| &nbsp;&nbsp;`reorderWithinDay` | 42 |
| &nbsp;&nbsp;`shiftDay` | 60 |
| Starting headline reserve | 43.0 |
| Starting floor reserve | 32.0 |
| Worst floor before | 0.0 |
| Worst floor after | 0.0 |
| Deficit days before | 21 |
| Deficit days after | 14 |
| Deficit area before | 505 |
| Deficit area after | 279 |
| First deficit crossing | 0 |
| Moves the search took | 33 |
| &nbsp;&nbsp;taken: `batchErrands` | 3 |
| &nbsp;&nbsp;taken: `insertRest` | 11 |
| &nbsp;&nbsp;taken: `reorderWithinDay` | 3 |
| &nbsp;&nbsp;taken: `shiftDay` | 16 |

What the app would say:

> I moved 16 things, batched 3 errands, added 11 rest blocks and reordered 3 blocks within its day. That is 7 days less underwater, though this fortnight is still beyond what rearranging can fix.

Smallest fixes (§2.2):

- Added a rest block on day 0: days underwater 21 → 19
- Added a rest block on day 1: days underwater 21 → 20
- Moved Dinner with housemates 2 days earlier: days underwater 21 → 20

## Verdict

**The optimizer has real freedom where it matters.** It moves work in the crunch fortnight and gains materially. The full rebalance can headline Focus 2.

Ordinary week: 2 moves, 6.3 reserve points, 0 days out of deficit. Crunch week: 33 moves, 0.0 reserve points, 7 days out of deficit, 16 moves rescheduling work.
