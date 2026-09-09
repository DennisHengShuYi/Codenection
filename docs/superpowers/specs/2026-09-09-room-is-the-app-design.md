# The room is the app — design

## The problem

The room was built as one component among many. Today's home screen is a vertical scroll:
two banners, six notification cards, the room beside a compact dial, a full dial, a check-in,
an accuracy note, and a row of four buttons. Four more features — the planner, photo import,
the request box and calibration — do not appear in it at all; they *replace* it through early
returns.

So §1.1's claim that "the room is the surface" is true of one section of a page. Everything
the app can actually do sits outside the room, in chrome that could belong to any planner.

This design makes the room the whole interface. Every feature is reached by touching a piece
of furniture, and every notification is a state of the object it concerns.

## Decisions taken, and what was turned down

**Diegetic, not decorative.** Objects *are* the controls. Rejected: the room as a backdrop
with conventional cards floating over it, which is close to what exists and makes the room
wallpaper.

**Zoom to the object for forms.** A brain dump needs a text area and the painter is a 3×24
grid; neither fits in a corner. Tapping the desk moves the camera into it, so one spatial
metaphor holds throughout. Rejected: a sheet covering most of the room, because at 320px it
is full-screen anyway and the promise only holds on desktop.

**A sidebar that focuses the object.** Clicking "Plan my week" highlights and zooms the desk —
the same thing tapping the desk does. Rejected: a sidebar that opens features directly, which
would make the list the app and the room a picture beside it.

**Notifications become object states.** The bed glows when rest is prescribed; a clutter box
pulses when its task is stuck. Rejected: a notification list, which recreates the chrome this
design exists to remove.

**One cut rather than incremental migration.** A half-diegetic UI is worse than either end
state. `main` stays deployable throughout because the work happens on a branch.

## Architecture

### The shell

`HomeScreen` becomes `RoomShell`, and stops being a switchboard. All view state collapses to
one union:

```ts
type View =
  | { kind: 'room' }
  | { kind: 'zoom'; objectId: ObjectId }
  | { kind: 'words' }
```

This replaces seven booleans — `planning`, `photographing`, `requesting`, `calibrating`,
`selected`, `confirmDismissed`, `energyAsked`. Today those permit contradictory states; a
union makes them unrepresentable.

The room SVG goes full-bleed at `100dvh` with its existing `viewBox` preserved. Every object
becomes a real `<button>` rather than a `<g onClick>`, so keyboard and screen-reader access
come from the element rather than from retrofitting.

Zooming transforms the SVG and renders the feature over the object's bounding box. Above
768px the room remains visible around the edges; at 320px the overlay takes the viewport,
because pretending otherwise makes every form unusable. With `useReducedMotion` set, the zoom
is an instant cut.

### One model, two views

A single `roomModel(reserves, projection, schedule, profile)` derives both the furniture's
state and the sidebar's rows. Not two functions that agree by convention — one that cannot
disagree with itself. Attention is derived on every render and never stored, so no flag can
get stuck.

This gives the design a property the current one lacks: if the SVG fails on some device, the
words view is a complete interface rather than a degraded one.

### Furniture

The nine bindings of §1.3 all stay exactly as they are. But they were designed to *show
state*, and being a *control* is a different job — a desk does not represent a reserve. Three
new pieces of furniture carry features that have no state to reflect.

| Object | Opens | Attention when |
|---|---|---|
| **Desk** *(new)* | Planner and photo import | — |
| **Phone** *(new)* | Request box; Telegram linking | A request is waiting |
| **Mirror** *(new)* | Calibration, "how you work", account | Calibration is thin |
| Papers | Block confirmation | A block needs confirming |
| Clutter box | That task's Micro-Start | Stuck 3 days, or 2 misses |
| Bed | Rest prescription | Rest is prescribed |
| Door | Outings | Lit (already built) |
| Character | Energy check-in | A prediction needs scoring |
| Window | Accuracy note and §8.2's disclaimer | — |
| Ceiling | Rebalance | A deficit crossing is ahead |
| Plant, light | State only; tapping states the reading | — |

The desk carries both text and photo input because they are one job: getting what you are
carrying into the app. The phone carries the request box and Telegram because both are the
outside world reaching you — the least certain mapping here, and the one to revisit first if
it does not read naturally.

Plant and light do nothing but report their reading. Silence teaches people to stop tapping.

### The sidebar, which is also the words view

One component, two presentations, so they cannot drift. At 768px and up it is a persistent
rail beside the room; below that it collapses to a toggle opening the same list full-screen,
because a sidebar and a usable room cannot share 320px.

Each row carries what it does, its current reading, and whether it wants attention:

```
Plan my week          desk          →
Get outside           door        ● lit
Things to clear       3 boxes       →
How I'm sleeping      2h owed       →
Someone asked me      phone         →
How I work            mirror      ● thin
```

The reading is what makes the list informative before anything is tapped, and what stops the
plant and the light being dead ends.

**Order is fixed, never sorted by urgency.** Things needing attention are marked, not moved.
A list that reorders itself must be re-learned on every visit by a screen-reader user, and a
sighted user stops trusting muscle memory in it.

**Low-energy mode is this list**, trimmed to the two things that matter and with no room at
all — roughly what `LowEnergyView` already does, now sharing one implementation rather than
being a separate screen.

## Testing

**Untouched:** every domain, engine and optimizer test — around 700. Every feature component's
own tests too. `PlannerScreen`, `PhotoImportScreen`, `RequestBoxScreen`, `CalibrationScreen`,
`BlockConfirm`, `Prescription`, `DoorPanel`, `MicroStartCard`, `EnergyCheckIn`, `AccuracyNote`
and `LapsedNotice` are presentational, take props, and do not care what contains them.

**Rewritten:** the eight `HomeScreen.*.test.tsx` files and the e2e specs that drive
`open-planner`, `open-photo`, `open-request` and `open-calibration`. Those buttons cease to
exist, so the tests are rewritten to drive objects and sidebar rows. That is correct rather
than unfortunate — behaviour genuinely changed, and its tests change in the same commit.

**New:**

- The view machine: every transition, and that no two views can be active at once.
- **A parity test** across generated states: every object showing attention has a marked row,
  and every marked row has an object showing attention. This is what stops the two views
  drifting apart over time.
- Zoom behaviour at 320 / 390 / 768 / 1280px.
- Keyboard traversal of every object, in a fixed order.

Coverage thresholds stay where they are: 97 / 91 / 97 / 98.

## Not in this design

- **New engine or optimizer behaviour.** This is a presentation change; the model is untouched.
- **Any change to what the features do.** The planner still parses, the request box still
  prices. Only their container changes.
- **Animation beyond the zoom.** §1.3's one tidy-up sequence already exists and is kept.
- **Removing any of §1.3's nine bindings.** All nine survive; three objects are added.

## Risks

1. **Discoverability without labels.** Mitigated by the sidebar and by attention living on the
   furniture — but the first time a judge opens this, they must not be stuck. If the sidebar
   is not enough, the fallback is a one-time hint on first open, not permanent labels.
2. **The phone doing double duty.** The request box and Telegram are coherent together but not
   obviously so. First thing to revisit.
3. **A large pull request.** One cut was chosen deliberately; the diff will be mostly test
   rewrites rather than new logic, and `main` stays deployable throughout.
4. **The zoom at 320px.** The room is not visible during a form on a phone, so the spatial
   metaphor is asserted rather than shown there. Accepted: a usable form matters more.
