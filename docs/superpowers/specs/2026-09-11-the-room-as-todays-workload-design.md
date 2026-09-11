# The room as today's workload

Date: 2026-09-11
Status: approved, implementing

## The change in one sentence

The room stops being a picture of the fortnight's reserves and becomes a picture of
**today**: every kind of block puts its own object in the room, in proportion to the hours
it takes, and a day that cannot fit inside its waking hours darkens the window and dims the
light.

## Why

The room's nine bindings all read the same few numbers — the overall reserve, the mental
reserve, the projected deficit. That is a coherent picture of a fortnight and a vague one
about today: a student looking at it can tell that things are heavy in general, and nothing
about what the day in front of them actually contains. Only one binding (the clutter boxes)
counts real events.

Meanwhile the reserve now has a better home than the furniture. Ruling 59 put the compact
readout in the corner gauge and the full breakdown behind it, so the room no longer has to
carry the reserve in its light and its ceiling as well.

## Decisions taken

Settled in brainstorming; recorded because each one closes off alternatives.

1. **The room draws today's workload.** Not the fortnight, and not both layered.
2. **Objects map to kinds, grouped by what a student would recognise as one thing.** Hard
   and light exercise share a dumbbell; draining and restorative company share the people in
   the room. Those splits are about what an hour COSTS, which the reserve models and the
   breakdown states -- and drawing restorative company differently would be the app telling a
   student how their afternoon went before they had had it.
3. **Quantity comes from hours, not block count.** Four hours of study fills the desk more
   than four twenty-minute blocks do.
4. **The room empties as the day is worked through.** A block the student has answered is
   put away. Nothing is counted up — the room is a mirror, not a scoreboard (§1.3).
5. **Darkness is computed before the bad night, not reported after it.** What darkens the
   room is today's work not fitting the waking day, which is the last moment at which the
   student can still move something.
6. **The window keeps its weather.** Weather is the forecast and darkness is the day; the
   two read together rather than fighting over one object.
7. **The character stays reserve-driven.** Ruling 55 makes it the app's statement about how
   the student is doing, which is not a property of today's timetable.

## Architecture

A new pure module, `src/ui/room/dayLoad.ts`, answers one question: *what does today consist
of?* It knows nothing about drawing.

```
dayLoadFor(schedule, today, blockLog) -> DayLoad {
  hoursByKind:     Record<ActivityKind, number>   // scheduled today
  remainingByKind: Record<ActivityKind, number>   // not yet answered
  totalHours:      number
  spillHours:      number                         // past the waking day
}
```

`roomStateFor` then binds that to objects. The split matters because the arithmetic is
where the mistakes will be and it is testable without a DOM, while the binding is a thin
readable layer that says what each object means.

Rejected: rewriting `roomStateFor` in place (nine bindings and the day arithmetic in one
function), and letting each scene component read the day (the same question answered
differently in seven places as they drift).

## The mapping

| Kind | Object | Status |
|---|---|---|
| `studyBlock` | books stacking on the desk | the paper stack rebinds |
| `hardExercise` + `lightExercise` | a dumbbell on the floor, heavier with the hours | new artwork |
| `socialDraining` + `socialRestorative` | people in the room, up to three | new artwork |
| `errands` | boxes on the floor | exists, already per-item |
| `rest` | **nothing** | deliberately unmapped |

**Rest gets no object.** It is the one thing on a day that is not a duty the student owes
anyone, and drawing it as another thing waiting to be done would turn the only restorative
item on the day into another obligation.

One shared rule turns hours into a quantity, with a per-object cap. A desk must be able to
look buried without twenty books on it — the floor already caps at six boxes for exactly
this reason, and that cap is the precedent.

`sleep` is not in the table either: it is not a block. It lives in `sleepByDay` and reaches
the room through the darkness below.

## Darkness

```
spillHours = max(0, totalHours - WAKING_HOURS)
```

The window darkens and the light dims in proportion to the spill. `WAKING_HOURS` already
exists in `prescribe.ts` as the app's own idea of how long a day is, so this uses the
number the rest of the app plans against rather than inventing a second one.

The two things the window now says are independent and compose:

| | light | dark |
|---|---|---|
| **clear** | rested, calm ahead | exhausted, calm ahead |
| **storm** | rested, rough patch coming | both, and the room says so |

**The corner gauge keeps reading the reserve directly, not `lightLevel`.** Once the light
means sleep, a gauge derived from it would show a number that is neither one thing nor the
other — and that gauge is now the door to the whole breakdown (Ruling 59).

## What is retired

- **The plant** loses its job and goes.
- **`RoomState` gains `reserve`** for the corner gauge, which used to derive its percentage
  from `lightLevel`. Once the light means the day, a gauge reading it showed 100% on a
  nine-hour day at 43% reserve -- caught by looking at the running room, not by a test.
- **The ceiling** keeps its meaning — pressure — and changes its source to today's total
  hours, so it belongs to the day like the rest of the furniture.
- **The door** is unchanged. It is a prescription ("getting outside answers both at once"),
  not a reading of load.

## The room in words

`roomText.ts` turns `RoomState` into the sentences that are the drawing's accessible label.
Every rebinding here has to carry through to it, or the room shows one thing and says
another to a screen reader — which is a worse failure than either alone, because only one
of the two audiences can tell.

## Testing

- `dayLoad`: table tests over hours per kind, the cap, blocks that have been answered, a
  day with nothing on it, and the spill at and either side of `WAKING_HOURS`.
- `roomState`: one test per rebinding, including that the plant is gone and the ceiling
  reads the day.
- `roomText`: the sentences follow the new bindings.
- The room's existing e2e geometry tests stay as they are — this changes what the drawing
  means, not where it sits.

## Staging

1. **The model and the objects that already exist** — `dayLoad`, the rebindings, books,
   boxes, blanket, ceiling, window, light, and the words. A complete, shippable room.
2. **The two new pieces of artwork** — the dumbbell and the figures. Illustration work with
   a different rhythm, and the room is coherent without it.

## Risk

The room is the app's landing screen and its central metaphor, so a change to what it means
is a change to what the product says. The mitigation is that every binding is one line in
one file with a test naming what it means, and the reserve — the thing a student most needs
to be able to trust — moves to the gauge, where it is stated as a number rather than
implied by furniture.
