# profs — the class page on one screen (design)

**Date:** 2026-09-08
**Status:** Approved, ready for implementation planning
**Follows:** the class one-pager (`2026-09-08-profs-class-one-pager-design.md`, shipped)
and salles & plans (`2026-09-08-profs-salles-and-plans-design.md`, shipped)

## What This Is

The class page is the screen a teacher touches every hour, and it no longer
fits on a screen. Measured in Chrome against `yarn dev`, on a 574px viewport:

| | |
|---|---|
| Page height with nothing open | 1364px |
| Top of the pupil card, once opened | y = 1033px |
| Height of the pupil card | 616px |
| Page height with the card open | 1996px |

The card is taller than the viewport on its own, and it lands roughly 460px
below the fold — so opening a pupil scrolls the room out of sight, and reading
the card means losing the thing the card is about.

That is the symptom. The cause is that every control on the page claims a
full-width band of its own: the header takes two rows, the séance strip a third
plus a line for `Supprimer la séance`, the group filter a label and a row of
44px chips, the salle picker another, and the unseated rail another — before the
room is drawn at all.

This phase puts the page back on one screen. It is a **layout** change: no
schema change, no migration, no new table, and no change to what anything
writes.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, two-step
in-place confirms for destructive actions, and `PupilName` as the only place a
pupil's name is composed.

Two of the changes below reverse rulings this repo argued for in writing. That
is the reason this is a spec rather than a commit message.

## The Ruling: The Day Menu Is a Shortcut, Not a Gate

`SeanceStrip` currently renders the day's slots **plus one slot from the nearest
lesson either side**, all styled identically, with the date to their left as a
label. So `7 sept. 8h00 | 10h00 | 10 sept. 14h00` puts three different days in
one row and marks none of them as a different day. The strip reads as a list of
times, and the reason it is not is invisible.

The day becomes a `<select>` listing days that hold a lesson; the segments
beside it show only *that* day's slots. Neighbour slots go.

This reverses the strip's own docstring — "It states the day rather than
offering a list… That was the `<select>` this replaces." The distinction that
makes the new one different, and that must survive into `CLAUDE.md`:

**The old select gated the register.** The page could not resolve a séance until
the teacher chose one, so taking the register began with a decision about dates.

**This one does not.** `defaultDay` still resolves the day from the clock, from
the URL, or from the last day taught, and the page opens on it with the register
ready. The menu is how you *leave* that day, not how you arrive at it. A teacher
who never opens it never notices it.

If that property is ever lost — if the page starts opening on "choose a day" —
the strip should come back, because the objection that removed it will have
become true again.

**What the menu lists.** Days carrying a lesson: a `Session` already recorded, or
a `ScheduleEntry` the timetable predicts. The window is four weeks back and two
weeks ahead. Back further than forward because the past is where marking
happens; two weeks ahead is enough to prepare the other side of an A/B
alternation, which is the same reasoning `NEIGHBOUR_SEARCH_DAYS` already
encodes.

`Supprimer la séance` moves to the end of the same row as a quiet link. It stays
a `ConfirmButton`.

## The Ruling: The Group Filter Leaves This Page

Phase 6 put one group filter in the class shell and argued for it: *"filtering
the roster to Groupe A and finding the seating plan unfiltered reads as a bug."*
That argument was about **consistency between two tabs**. The tabs are gone. The
one-pager has a single pupil surface, so there is no second view left to
disagree with, and the ruling has outlived the structure it described.

The filter is removed from the class page. It is not removed from the app:
`GroupFilter` still serves `class/students-page.tsx` and `gradebook/page.tsx`,
and `filterByGroup` / `resolveGroupSelection` stay in the domain with their
tests.

Removing the last consumer here lets `PlanPage` drop its `selectedGroupId` and
`memberships` props entirely, which is the actual simplification — the plan
stops carrying a filter it now never applies.

This is explicitly reversible and expected to be revisited: restoring it is a
revert of one commit. It is out **for now**, because a class of 24 with two
groups did not earn a permanent 90px band on the busiest screen in the app.

## The Ruling: The Pupil Card Takes the Panel, Never the Page

`StudentCard` has always rendered at the end of the outer column, and at 616px
it is now the single largest thing on the page. It moves into the right panel,
where it **replaces the panel entirely** — salle picker, séance note and carnets
all give way while it is open.

Replacing rather than pushing, because pushing is what produces the current
failure at a smaller scale: a panel that grows by 600px when you tap a pupil
moves the note you were writing off screen. A panel that swaps its contents has
a fixed height, and the page stops moving underneath the teacher.

Nothing is lost by the swap: closing the card restores the panel, and the
gestures do not overlap. `Déplacer` closes the card before you aim at a desk,
and seating an unplaced pupil starts from the rail with no card open.

**Below `lg` the card is a bottom sheet instead** — `Modal` with
`placement="bottom"`, which already caps at `88vh`, scrolls internally, locks
body scroll, traps focus, and closes on Escape or backdrop. There is no side
column on a narrow screen to take over, and a card appended below a room is the
bug being fixed.

`Modal` rather than `Sheet`: `Sheet` draws its own title-and-close header and
the card already has one, so composing them stacks two close buttons.

**One card is mounted at a time.** The branch is a `useMediaQuery` hook, not
`hidden lg:block` on two copies. Two mounted cards would mean two sets of
`useLiveQuery` subscriptions, two independent notes drafts racing each other's
`onBlur` write, and a hidden `Modal` running its focus-trap effects.

The card's internals do not change. This spec moves where it mounts.

## The Ruling: The Rail Appears Only When It Has Something to Say

`Élèves sans place` currently occupies a bordered band above the room at all
times, and on a seated class it says "Tous les élèves sont placés" — a
permanent band to report the normal state.

It moves **below the room**, inside the plan, and renders only when somebody is
actually unseated. A fully seated class, which is the steady state for most of a
term, gets the space back.

Below rather than above because it is now conditional: a band that appears above
the room would push the room down the moment a pupil is unseated, moving the
desks under a hand that is mid-gesture.

## The Header: A Breadcrumb, and Two Buttons That Stop Shouting

One band:

```
≡  Classes / 3°B   3e · 24 élèves          Élèves  Journal  ⋯
```

`Classes` is a `Link` to `Router.Classes()` — the page had no way back to the
list except the drawer. `3°B` stays an `h2`, so the page keeps a heading and a
screen reader keeps its landmark. Level and pupil count become one quiet run.

`Renommer la classe` and `Supprimer la classe` move behind `⋯`, which opens
`Modal` with `placement="center"`. Two reasons, and the second is the real one:
they are rare, and a full-size **Supprimer la classe** sitting on the screen used
with a class in front of you is one mis-tap from the confirm step of destroying
a term of marks. Two deliberate taps is the right price.

No new popover primitive — `Modal` already owns the focus discipline, and the
repo has paid for that list once.

## What Is Not in This Spec

- **The carnets stay on the page.** Moving them off was considered and dropped:
  it is a navigation change, not a layout one, and it should be argued on its
  own.
- **The room canvas is unchanged.** No change to `RoomCanvas`, to desks, to
  `resolvePlacement`, or to anything under `/salles`.
- **No change to what writes when.** Opening this page still writes nothing.
  Every path to a séance row still goes through `ensureSeance` and still awaits
  it before writing. `getOrCreateSessionAt` is not called from an effect.
- **The roster-register fallback** (a workspace with no salle) keeps its current
  inline card. It is a fallback screen with no right panel to take over, and
  giving it the sheet treatment is scope this change does not need.

## Domain Additions

One new tested function, in `src/domain/seance.ts`:

```ts
teachingDays(
  entries: ScheduleEntry[],
  history: Session[],
  termStart: number | null,
  today: number,
  window: { backDays: number; aheadDays: number },
): number[]
```

`backDays` / `aheadDays` are counted in **days**, not weeks — the caller passes
28 and 14. Named in days because the walk steps a day at a time and a week is
not a unit the calendar helpers know.

Days at local midnight, oldest first, that hold a séance or a scheduled lesson.
It walks the calendar with `nextDay` / `previousDay` rather than adding
`86_400_000`, for the reason `weekParity` and `monthGrid` do: a DST change slides
millisecond arithmetic by an hour and eventually by a day, and a day menu that is
wrong by one looks exactly like a day menu that is right.

Tests: a day with only a séance, a day with only a schedule entry, a day with
both appearing once, an A/B alternation landing on the correct parity, a window
boundary, and a walk across a DST change asserting no day is skipped or doubled.

One new hook, `src/modules/shared/use-media-query.ts` — `matchMedia` behind a
`useSyncExternalStore` subscription, the same shape `DbProvider` already uses to
track the active workspace. Not tested: it is a thin wrapper over a browser API,
and this repo tests domain and `src/db`, not components.

## Files

| File | Change |
|---|---|
| `src/modules/class/page.tsx` | header + breadcrumb + `⋯` menu; drop the group filter and its state; pass the card into the panel |
| `src/modules/class/components/seance-strip.tsx` | day `<select>`, that day's slots only, `Supprimer` inline |
| `src/modules/plan/page.tsx` | salle picker out to the panel; rail below the room and conditional; drop `selectedGroupId` / `memberships` props |
| `src/domain/seance.ts` | `teachingDays` |
| `src/domain/seance.test.ts` | its tests |
| `src/modules/shared/use-media-query.ts` | new |
| `src/i18n/locales/{fr,en}.json` | breadcrumb, menu, day-select labels — both files, or the parity test fails |

No `src/db/` change. No `db.version()` bump. No `backup.ts` change.

## Verification

`yarn format && yarn lint && yarn typecheck && yarn test` green — remembering
that `node` is not on the default PATH here and comes from `fnm`.

Then Chrome against `yarn dev`, at ~1440 and ~700 wide:

1. Measure page height with nothing open, and again with a card open. The card
   must not extend the page at all on wide, and must cap at `88vh` on narrow.
2. Open a card at both widths. On wide the room stays visible; on narrow the
   sheet rises over it.
3. Escape and a backdrop click both close the sheet, and focus returns to the
   desk that opened it.
4. `Déplacer` closes the card and arms the placement gesture; the next desk tap
   still moves the pupil.
5. Unseat a pupil — the rail appears below the room. Re-seat them — it goes.
6. The day menu changes day; the slots beside it change with it; the URL carries
   `date` and `at`; opening the page writes no séance row (check
   `db.sessions.count()` before and after).
7. `⋯` opens, Escape closes it, and Supprimer still needs its second tap.
