# Modal redesign and URL routing

Date: 2026-09-10
Status: approved, ready for an implementation plan

## Problem

Two faults, one surface.

**The modals are shapeless.** All six go through one `Sheet` (`src/ui/kit/Sheet.tsx`), which
is `fixed inset-0` below 768px and a fixed `inset-y-8 inset-x-[12.5%]` panel above it. The
panel's height is therefore the viewport's, whatever it holds: the settings sheet's three
radios and one sentence occupy most of a 1440x900 screen, with the remaining two thirds
blank. There is also no backdrop, so nothing dims the room behind the panel and a click
outside it does nothing. Inside, the parts have drifted -- the low-energy control is raw
browser radios in a bordered fieldset, the add chooser is three centre-aligned buttons with
no room to say what they do, and the settings sheet's signed-out sentence floats loose in
the body.

**The address never changes.** Navigation is a single `View` value held in `useState` in
`RoomShell` (`src/ui/room/view.ts`). Every state -- the week, a block, settings, the add
flow and its three sub-flows -- renders at `/`. A modal cannot be linked to, survives no
refresh, and the browser's Back button leaves the app from anywhere inside it.

## Decisions taken

Settled during brainstorming; recorded here because each one closes off alternatives.

1. **Both halves ship together**: the geometry change and a full visual pass, not one or
   the other. They touch the same six components, and doing them separately means reviewing
   the same files twice.
2. **Real paths, deep.** Not hash routing: Vercel already rewrites every non-`/api` path to
   `index.html` (`vercel.json`), so paths work on refresh and when pasted, and the auth
   redirect already owns the hash (`scrubAuthFragment.ts`). The add sub-flows and the block
   id are in the address, not just the top-level modal.
3. **Back closes one step.** `/add/photo` -> Back -> `/add` -> Back -> the room. A block
   returns to the week it was opened from.
4. **Hand-rolled, not `react-router-dom`.** The router wants to own layout through
   `<Routes>`/`<Outlet>`; this app is one `RoomShell` with conditional branches, so adopting
   it means restructuring the shell and rewriting the render setup in roughly fifteen test
   files -- a 60KB dependency to serialise five states.
5. **`View` stays the single source of truth.** The URL is a projection of it, never a
   second store. This is the mitigation for the change's width: components keep reading what
   they read today.

## Section 1 -- Routing model

### The path table

| Path | View |
|---|---|
| `/` | `{ kind: 'room' }` |
| `/week` | `{ kind: 'week' }` |
| `/week/block/:itemId` | `{ kind: 'block', itemId }` |
| `/settings` | `{ kind: 'settings' }` |
| `/add` | `{ kind: 'add', way: null }` |
| `/add/photo` | `{ kind: 'add', way: 'photo' }` |
| `/add/type` | `{ kind: 'add', way: 'type' }` |
| `/add/request` | `{ kind: 'add', way: 'request' }` |

`itemId` is percent-encoded on the way out and decoded on the way in; item ids are
free-form strings, so a title-derived id containing a slash or a space must not be able to
produce a path that parses back as something else.

Any other path resolves to the room, and the hook `replaceState`s to `/` on mount so the
address does not keep asserting a state the app is not in. `replace`, not `push`: a bad
address should not become a history entry you can press Back into.

### Two pure functions plus one hook

- `toPath(view: View): string` and `fromPath(pathname: string): View` in `view.ts`. Pure,
  total, and each other's inverse for every reachable `View` -- which is what makes the
  routing layer testable without a DOM.
- `useUrlView()` in `src/ui/room/useUrlView.ts` returns `[view, setView]`, exactly the shape
  `RoomShell` uses today, so its call site changes by one line. It seeds state from
  `window.location.pathname`, writes the address when the view changes, and updates state on
  `popstate`. Guarded on `typeof window` so a non-DOM environment gets the room rather than
  a crash.

### Two consequences of the deep paths

**`AddSheet.way` moves into `View`.** It is private `useState<AddWay>` inside `AddSheet`
today, which is the precise reason `/add/photo` cannot currently exist. `View` gains
`{ kind: 'add', way: null | 'photo' | 'type' | 'request' }`; `AddSheet` takes `way` and an
`onWay` callback as props and stops holding the state. `'choose'` becomes `null` so the
absence of a sub-flow is one value rather than a magic string.

**A block stays under the week.** `back()` already routes a block to the week rather than
the room, including one opened from the room's stuck card
(`RoomShell.tsx`, `onStuckStart`). `/week/block/:itemId` states in the address what the
existing rule already does, rather than introducing a second, shallower truth at
`/block/:itemId`.

### Push versus replace

One predicate, so Back cannot loop:

- **Descending pushes.** Room -> `/add` -> `/add/type` leaves two entries, so Back steps
  down to the chooser, which is decision 3.
- **Ascending replaces.** Cancel inside a sub-flow returns to `/add` by replacing. If it
  pushed, Back from the chooser would walk the student *forward* into the flow they just
  cancelled. The same applies to closing any sheet to `/` and closing a block to `/week`.

"Ascending" is a path-prefix test: the next path is an ancestor of the current one.

### Interaction with the auth redirect

`scrubAuthFragment` clears the OAuth token with
`history.replaceState(null, '', pathname + search)`, preserving the path. It therefore
cannot clobber a route, and needs no change -- but it does mean both features write history,
so the routing tests must not assume they own `history` exclusively.

## Section 2 -- Modal geometry

`Sheet`'s public contract (`title`, `onClose`, `actions`, `children`) does not change, so
the six callers keep their JSX and the change lands in one file.

- The outer `fixed inset-0` becomes a real backdrop: dimmed, centring its panel.
- The panel becomes `w-full max-w-lg`, its height driven by content and capped at
  `min(90dvh, 44rem)`. The body is the only scrolling region; header and action bar stay
  pinned, as they are today.
- Below 768px it stays full-bleed and square-cornered. The existing docstring is right that
  a brain-dump box squeezed into a phone-sized card is unusable.
- Backdrop click closes, matching Escape. It fires on a click that both starts and ends on
  the backdrop, so releasing a drag-select outside the panel does not close the sheet.
- The page behind gets a scroll lock while a sheet is open.

**Out of scope, deliberately:** a Tab focus trap. `aria-modal="true"` currently claims a
containment the component does not implement, which is a real gap -- but it is a third
concern, and it should be fixed knowingly rather than smuggled in behind a redesign.

## Section 3 -- Visual pass

- **Option rows.** `LowEnergyControl`'s three radios become full-width selectable rows, the
  selected one carrying an accent ring. They stay real `<input type="radio">` elements in a
  `fieldset`/`legend`, so keyboard and screen-reader behaviour is unchanged; only the
  presentation moves.
- **Choice list.** The add chooser's three buttons get the same row treatment: left-aligned,
  with room for a line of description each, instead of centred labels that have to carry the
  whole explanation in three words.
- **Header and action-bar rhythm.** One spacing scale, one border treatment and one title
  size across all six modals. Action bars right-align the primary action and keep quiet
  actions left.
- **The loose sentence.** Settings' signed-out "Sign in to keep this week and link Telegram
  to it." becomes a proper row rather than a paragraph floating in the body.

Everything draws on the existing tokens in `src/styles.css` -- `surface`, `line`, `ink`,
`ink-soft`, `attention`. The backdrop is the one new value.

## Section 4 -- Testing

Tests are written first, per `.claude/CLAUDE.md`.

**Unit, no DOM.** Table tests over `toPath`/`fromPath`: every state round-trips, every path
in the table parses, an unknown path yields the room, and an `itemId` containing a slash,
a space or a percent sign survives the trip.

**Hook.** `useUrlView`: seeds from the initial path; pushes when descending; replaces when
ascending; responds to `popstate` without pushing; `replaceState`s an unknown path to `/`.

**Integration, through `RoomShell`.** Clicking `+` puts `/add` in the address and
`Photograph something` puts `/add/photo`; a simulated Back returns to the chooser;
rendering with the address already at `/settings` or `/add/photo` opens that state directly.

**Component.** `Sheet`: backdrop click closes, Escape still closes, a click that begins
inside the panel and ends on the backdrop does not close, the scroll lock is applied and
released, and the panel carries the new geometry.

**Updated in the same change**, per "Tests are part of the change": `Sheet.test.tsx`'s
geometry assertions, `RoomShell.room.test.tsx`, and any test that reaches an add sub-flow
through internal state.

**One known hazard.** jsdom shares a single `history` across the tests in a file, so state
leaks between them unless each test resets it. The suite gets a reset helper, built
deliberately rather than discovered as flake.

**End to end.** `tests/e2e/room.spec.ts` and `tests/e2e/week.spec.ts` gain address
assertions on the paths they already walk through.

## Risk

The change touches the navigation value that roughly fifteen test files drive, so the blast
radius is wide even though each individual edit is small. The mitigation is decision 5:
`View` remains what components read, and the URL is derived from it. If the routing layer is
removed entirely, the app still works.

## Addendum, same day: what changed after this was written

Two things landed in the same change that this document, written first, does not describe.

**The week became a sheet, and the breakdown moved behind the gauge (Ruling 59).** The week
was the only destination in the app that was a page: it replaced the room, carried its own
title bar and Settings button, and needed a "Back to the room" link. It is now a `wide`
sheet holding the calendar and Rebalance. The dial, trend line and five bars that used to
sit under that calendar are behind the room's own corner gauge at `/reserves`, which is why
the path table above gains a row. Ruling 56's low-energy gate travelled with them: the
gauge is not a door in low-energy mode, and `/reserves` typed by hand lands on the room.

Because every destination is now a sheet over a live room, the room stage carries `inert`
while one is open, so background controls leave the tab order and the accessibility tree.
The sheets are rendered as siblings of that stage rather than inside it -- `inert` applies
to a whole subtree, and a sheet within it ignores every click made at it. jsdom implements
no part of `inert`, so the unit suite could not catch that; `dial.spec.ts` did.

**The action bar was not reversed.** Section 3 said action bars would right-align the
primary action. They right-align as a group but keep each caller's own order: `PlannerScreen`
leads with Cancel and ends on its primary, `BlockSheet` leads with the primary because its
buttons come from a precedence list, so a global flip would put one of them backwards.
