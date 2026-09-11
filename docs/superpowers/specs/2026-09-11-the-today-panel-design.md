# The today panel

Date: 2026-09-11
Status: approved, implementing

## The change in one sentence

A panel beside the room saying what each object means and how much of today it accounts
for, where clicking a row opens the events behind it — without the drawing itself becoming
a control.

## Why

§45 made the room a picture of today: study stacks books, exercise puts a dumbbell out,
company puts people in the room. Nothing anywhere says so. A student meets a room with
three books and a dumbbell in it and has to infer the vocabulary, and the one thing the
drawing cannot do is explain itself.

The same panel answers a second question the room cannot: *what, specifically?* The room
says four hours of study; it cannot say which four hours or what they are.

## The decision this change runs into

§3 removed tap-to-open from the room, and the e2e guard that protects it names this exact
change in its own docstring:

> it is worth one test that the tap targets stay gone, because "make the furniture clickable
> again" is exactly the kind of change that reads as an improvement.

There is also a structural reason, not merely a recorded preference. The drawing carries
`role="img"`, which hides its entire subtree from the accessibility tree — so a control
placed inside it is invisible to a screen reader while looking perfectly correct.

**So the panel is the control surface and the drawing is untouched.** Each row is a real
`<button>`: keyboard-reachable, announced, and outside the `role="img"` subtree. The guard
test stays exactly as it is, and its continuing to pass is the check that this design did
what it claims.

## Decisions taken

1. **The panel is clickable; the drawing stays a picture.** §3 holds.
2. **The legend and today's list are one thing**, because every row names a real thing on
   today. A separate always-on legend would repeat itself daily once the student has learned
   the vocabulary.
3. **Floating from 768px, a sheet below it.** The room is full-bleed and Ruling 55 forbids
   covering the character; at 320px there is no "beside". On a phone the panel opens from a
   button in the control row — the pattern `Waiting` already established, so a phone gains
   no new furniture.
4. **A row expands in place**, rather than opening a sheet on top of a sheet.

## The rows

| Row | Means | Quantity |
|---|---|---|
| Books | study | hours of `studyBlock` today |
| Dumbbell | exercise, hard or light | hours of both exercise kinds |
| People | time with people | hours of both social kinds |
| Boxes | errands waiting | count of pending errands today |
| Bed | sleep | `sleepByDay[today]` |
| Rest | *no object — rest is not a duty* | hours of `rest` today |

The groupings are the ones `roomState` already uses, read from the same place, so the panel
and the drawing cannot come to disagree about what a dumbbell means.

**Rest earns a row without an object.** §45 gave it no furniture deliberately — it is the
one thing on a day that is not a duty — but a panel that is also today's list would be
lying by omission if a rest block on today appeared nowhere.

**The bed row has an honesty limit worth stating.** `sleepByDay` defaults to 7 for a night
nobody has answered, and nothing records whether it was answered — so the row cannot
distinguish "you slept seven hours" from "nobody has asked yet". It is therefore worded as
the week's own figure rather than as a claim about the student's night.

## Architecture

```
todayPanel.ts   (pure)   schedule + today + blockLog -> PanelRow[]
TodayPanel.tsx  (view)   rows, expansion, one <button> per row
RoomShell               floating at md+, or a sheet at /today below it
```

`todayPanel.ts` reuses `blocksOnDay` rather than filtering again, for the reason §45's
`dayLoad` does: "which blocks are on this day" already has one answer in this codebase.

The floating container is a **sibling** of the stage, like the sheets, and capped so it
cannot reach the character — the `CHARACTER_BOTTOM`-derived reasoning the band used, and
`room.spec.ts` measures it at four viewports.

The sheet gets its own address, `/today`, because every other destination has one since
Ruling 57.

## Testing

- `todayPanel`: table tests over grouping, hours, an empty day, answered blocks, the sleep
  row, and a rest block appearing without an object.
- `TodayPanel`: a row is a real button, expansion shows the events with their times, and an
  answered block reads as done.
- `RoomShell`: the button exists only below 768px, the floating panel only above it, and
  `/today` opens the sheet.
- e2e: the split at four viewports, and a re-assertion that the room still contains no
  controls — the check that §3 survived this change.

## Staging

1. **The module, the component and the phone sheet.** Complete and usable on its own.
2. **The floating desktop container**, which is layout work with its own viewport checks.

## Risk

The room is the app's central metaphor and this adds a second surface beside it. The
mitigation is that the panel owns no state and derives everything from the same functions
the drawing derives from: if the two ever disagree, one of them is reading a different
week, which a test will say out loud.
