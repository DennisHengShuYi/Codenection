
# §2.5 degrees of freedom

Measured on a realistic UM final-year fortnight, before any rebalance UI exists.

## Ordinary fortnight

| Measure | Value |
|---|---|
| Items in the schedule | 48 |
| Of those, movable | 21 |
| Legal single moves available | 131 |
| &nbsp;&nbsp;`batchErrands` | 12 |
| &nbsp;&nbsp;`insertRest` | 11 |
| &nbsp;&nbsp;`insertSocial` | 13 |
| &nbsp;&nbsp;`reorderWithinDay` | 32 |
| &nbsp;&nbsp;`shiftDay` | 63 |
| Starting headline reserve | 58.8 |
| Starting floor reserve | 45.0 |
| Worst floor before | 42.0 |
| Worst floor after | 51.2 |
| Deficit days before | 0 |
| Deficit days after | 0 |
| Deficit area before | 0 |
| Deficit area after | 0 |
| First deficit crossing | none |
| Moves the search took | 2 |
| &nbsp;&nbsp;taken: `insertSocial` | 1 |
| &nbsp;&nbsp;taken: `shiftDay` | 1 |

What the app would say:

> I moved 1 thing and made time to see someone on 1 day. Your worst day goes from 42 to 51.

Smallest fixes (§2.2):

- Made time to see someone on day 0: worst day 42.0 → 49.7
- Moved Dinner with housemates 2 days earlier: worst day 42.0 → 43.7
- Moved Dinner with housemates 1 day earlier: worst day 42.0 → 43.5

## Crunch fortnight

| Measure | Value |
|---|---|
| Items in the schedule | 51 |
| Of those, movable | 24 |
| Legal single moves available | 136 |
| &nbsp;&nbsp;`batchErrands` | 12 |
| &nbsp;&nbsp;`insertRest` | 10 |
| &nbsp;&nbsp;`insertSocial` | 12 |
| &nbsp;&nbsp;`reorderWithinDay` | 42 |
| &nbsp;&nbsp;`shiftDay` | 60 |
| Starting headline reserve | 43.0 |
| Starting floor reserve | 32.0 |
| Worst floor before | 0.0 |
| Worst floor after | 0.0 |
| Deficit days before | 20 |
| Deficit days after | 14 |
| Deficit area before | 492 |
| Deficit area after | 293 |
| First deficit crossing | 1 |
| Moves the search took | 34 |
| &nbsp;&nbsp;taken: `batchErrands` | 3 |
| &nbsp;&nbsp;taken: `insertRest` | 11 |
| &nbsp;&nbsp;taken: `reorderWithinDay` | 3 |
| &nbsp;&nbsp;taken: `shiftDay` | 17 |

What the app would say:

> I moved 17 things, batched 3 errands, added 11 rest blocks and reordered 3 blocks within its day. That is 6 days less underwater, though this fortnight is still beyond what rearranging can fix.

Smallest fixes (§2.2):

- Added a rest block on day 0: days underwater 20 → 19
- Added a rest block on day 1: days underwater 20 → 19
- Added a rest block on day 3: days underwater 20 → 20

## Verdict

**The optimizer has real freedom where it matters.** It moves work in the crunch fortnight and gains materially. The full rebalance can headline Focus 2.

Ordinary week: 2 moves, 9.2 reserve points, 0 days out of deficit. Crunch week: 34 moves, 0.0 reserve points, 6 days out of deficit, 17 moves rescheduling work.
