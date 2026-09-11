# profs — yellow cards that escalate (design)

Status: designed, not implemented.
Builds on the behaviour log described in `CLAUDE.md` under *Invariants worth
knowing* (**behaviour events are append-only**) and on the séance model from
`2026-09-09-profs-dated-week-home-design.md` (every séance carries a start).

## What This Is

A practising teacher tested the app and came back with a mechanic he already
runs in his classroom: **Y cartons jaunes over the last X séances make a
carton rouge**. Two over two, in his case. He wants X and Y configurable, the
whole thing switchable off, a moment of theatre when a red lands, and the
preceding lessons' yellows visible on the plan de table so he can see an
escalation coming before he taps.

The mechanic is not new information the app has to collect. Every yellow is
already a row; the rule is a way of *reading* the rows it already has. That
observation is the spine of this design, and almost every decision below
follows from it.

## The Red Card Is Derived, Never Stored

`logBehaviour` writes nothing new. A rule function reads the pupil's yellows in
the current window and answers *this pupil is at red*.

This is the posture `studentAverage` already takes, and for the same reason a
stored average is refused: the answer depends on inputs that keep moving. Lower
the threshold in January and a stored red from October would silently stop
following from its own yellows. Delete one of the two yellows that produced it
— a mis-tap, corrected the way this app corrects every behaviour event — and
the red would sit there as an orphan, still exported, still counted, describing
an escalation that no longer exists. Deriving it means the rule and its
conclusion cannot disagree, ever, because there is only one of them.

It also keeps the log honest about what it is. A `BehaviourEvent` records what a
teacher **observed**; a red the app invented is not an observation, and putting
one in the same table would make every count, every export and every conseil de
classe read a claim nobody made.

The cost is stated rather than hidden: a teacher cannot delete the automatic
red on its own. The correction is to delete one of the yellows behind it, which
is the honest gesture anyway — the red was never the thing that happened.

### The window

`escalationWindow` orders the class's séances by `date` then `startsAt` and
takes the `rule.seances` ending at **the one on screen, inclusive**. A séance
id it cannot find in the list yields an empty window, and so does the case that
matters in practice: a lesson where nothing has been recorded yet has no séance
row at all, so there is nothing to count and nobody is at red. With 2/2, a
yellow today plus one last lesson is a red, and two yellows today is a red as
well.

The window is the CLASS's séances, not the pupil's attended ones, and that was a
real choice. A per-pupil window that skipped absences would be fairer to an
absentee — but it would depend on attendance being marked, which is lazy and
routinely incomplete, and it would mean two pupils sitting in the same room were
being judged on different stretches of the term. *Deux sur deux* has to mean the
same thing in every seat or it is not a rule, it is a mood.

Walking the **timetable** back X lessons was rejected for the reason nothing in
this app is materialised from the timetable: holidays, strikes, cancellations
and sick days would each silently eat a slot of the window.

### The rule keeps firing

It is stateless. A pupil is at red whenever their yellows in the current window
reach Y, and the window simply slides. Yellow in séance 1, yellow in séance 2 —
red. Yellow in séance 3, with séance 2's still inside the window — red again,
animation and all.

A *slate wiped clean* alternative, where yellows that already produced a red
stop counting, needs a record of which yellows were consumed. That is stored
state, and it is exactly what deriving was chosen to avoid. The stateless answer
also says the truer thing: this pupil is still at two yellows in two lessons.

### Two floors in the domain, not in the form

`seances >= 1`, and **`yellows >= 2`**. A `yellows: 1` rule makes every yellow
instantly a red, which is not an escalation — it is renaming the button, and it
would fire the fullscreen animation on every single tap.

## Where the Rule Lives

A new `settings` store, one row, `id: "workspace"`, carrying `escalation`.

It is a rule about the établissement's discipline, not about this device, so it
belongs with the pupils it judges rather than in `localStorage` beside the theme
and the term anchor. The consequence that decides it: the JSON export carries
it, so a teacher restoring onto their tablet gets the same rule instead of a
silently different one. A red card that means two things on two devices is worse
than no automation.

Per-class rules were considered and cut. Sixteen classes would mean sixteen
copies of the settings UI, and the request was for one control in Réglages.

A `settings` store rather than a field on something existing, so the next
preference lands in it without another version bump.

## Schema and Backup

- `db.version(17)` becomes **18**, adding `settings: "id"`. No new upgrade
  function — this is the additive case the standing rule covers. The existing
  `.upgrade()` rides along to 18 and is idempotent: a workspace already at 17
  has `startsAt` on every séance, so `repairSeanceCollisions` changes nothing
  and its `modify` is a no-op.
- `backup.ts`: format **13 → 14**. `settings` added BY HAND to the export
  object, the Zod schema, `importWorkspace`'s clear array and its `bulkAdd` —
  all four, because both sides build a literal array rather than reading
  `db.tables`. A format-13 file is then refused whole, which is this codebase's
  standing posture for an unreleased app.
- `seed.ts` writes the row at `{ enabled: true, seances: 2, yellows: 2 }`.
- `readSettings` falls back to `DEFAULT_ESCALATION` when the row is absent, so a
  wiped workspace and a workspace created before this change both behave.

## Modules

**`src/domain/escalation.ts`** — pure, no I/O, the only place the arithmetic
exists.

```ts
export interface EscalationRule { enabled: boolean; seances: number; yellows: number }
export const DEFAULT_ESCALATION: EscalationRule = { enabled: true, seances: 2, yellows: 2 }

escalationWindow(sessions, currentSessionId, rule): string[]
yellowsInWindow(events, windowIds): BehaviourEvent[]
isEscalated(count, rule): boolean
```

**`src/db/escalation.ts`** — `escalationContext(db, classId, currentSessionId,
rule)` returns the window ids and the window's yellows grouped by pupil, in
**two** queries for the whole room: the class's séances, and
`behaviourEvents.where("sessionId").anyOf(windowIds)`. The plan page already
reads per-séance this way; this is the same shape widened to X séances, and it
must stay one pair of queries rather than one per seat.

**`src/modules/shared/escalation-provider.tsx`** — holds the announced pupil,
renders the overlay, exposes `useAnnounceRedCard()`. Wrapped by `AdminLayout`,
so the seating plan and the salle-less roster register both reach it from one
place rather than each mounting an overlay of their own.

Reading and firing are separate on purpose: the derived state is a read every
render does, and the animation is an event that happens once, at a tap.

## The Fullscreen Red Card

`StudentCard.addBehaviour`, after `logBehaviour`: if the type is `yellow` and
the rule is on, evaluate, and announce when the count is at or above Y. There is
no crossing test, because the rule keeps firing.

The overlay is a `position: fixed` element and emphatically **not** a
`<dialog>` — blocking dialogs are banned here, and they freeze the browser
automation these screens are verified with. The card scales and settles in with
the pupil's surname in capitals through `PupilName`, holds about 2.5s, and fades
on its own. A tap anywhere cuts it short. `prefers-reduced-motion` collapses the
motion to a plain fade of the same dwell.

Auto-dismissal is the point: a teacher mid-lesson never has to find a button,
and a tablet cannot be left sitting on a red card instead of on the register. An
*Annuler* on the overlay was considered — the moment after a mis-tap is exactly
when a wrong red is most likely — and cut, because the same undo already sits
one tap away in the card's own event list, and a surface whose whole merit is
that it needs no interaction should not grow a control.

Worth recording as a decision rather than a side effect: the overlay names a
pupil in red across the whole screen, so it is legible to anyone standing near
the tablet. That is the teacher's pedagogical call and it is what was asked for.

## The Seat Tile

`SeatOccupant` today draws this séance's events as solid 9x13px cards, capped at
three with `+n`. It becomes ONE run of **four slots**, left to right:

1. hollow prior-séance yellows, oldest first
2. this séance's solid events
3. the derived red, last, hard against the face

Over budget, slots are dropped from the **left** and `+n` goes there — so the
newest events and the red are never what falls off. One counter, not two: two
runs with two overflow counts on a 44px tile is a puzzle, not a reading.

**Only yellows appear from prior séances, and only from inside the window.** The
dashed cards are precisely what the rule is counting, so the seat reads as the
rule itself — two hollow plus one solid IS the red. Drawing a past green or a
past *mot dans le carnet* would be history the tile was never for, and with a
budget of four it would routinely push out the one fact the history exists to
carry.

**Hollow, not literally dashed.** A dashed stroke on a 9x13px box is about four
dashes and reads as noise at the scale a room shrinks to, which is the same
argument that turned the behaviour dot into a rectangle in the first place. Same
rectangle, 1px solid border in `--behaviour-yellow`, fill at low alpha. It is a
one-line change if a real dash proves better on a device.

**The derived red draws as an ordinary red card.** At 9px, *red* is the entire
message, and marking it as derived would cost more pixels than the distinction
buys. The distinction lives in `useSeatLabel` instead — the word *carton rouge
automatique* in the tile's `title` and accessible name — which is exactly where
the attendance pill already puts its word, and for the same reason.

## The Pupil Card

Above the behaviour buttons, when the rule is on and the window holds any
yellow: one line — *2 avertissements sur les 2 dernières séances* — going red
and gaining *carton rouge automatique* when escalated.

This is the only place the rule explains itself in words, which is what lets the
tile stay silent.

The pupil page's Comportement timeline and `countByType` are **untouched**. They
stay a record of what was observed; the export stays truthful; a conseil de
classe reads rows, not inferences.

## Réglages

A new *Comportement* section, the same `<section className="flex flex-col
gap-2">` shape as Thème: a switch for on/off, then two number fields — *Cartons
jaunes* (Y) and *sur les N dernières séances* (X) — clamped to the domain's
floors and disabled while the rule is off. A sentence beneath states the current
rule in plain French, so the two numbers cannot be read backwards.

## i18n

A top-level `escalation.*` key in both `fr.json` and `en.json`. Réglages, the
pupil card line, the seat label and the overlay all draw from it, and a key
shared by four surfaces belongs to none of them — the ruling `attendance.*` and
`calendar.*` already got.

## Testing

- `domain/escalation.test.ts` — the window; the boundary at exactly Y; disabled;
  X longer than the class's history; the current séance counting; several
  yellows inside one séance; a yellow from the séance just outside the window.
- `db/escalation.test.ts` and `db/settings.test.ts` against `fake-indexeddb`,
  including the absent-row fallback.
- `backup.test.ts` — format 14, `settings` round-tripped.
- `index.test.ts` — `settings` in the table list.
- `workspace.test.ts` — a settings row seeded, so the wipe test covers it.
- No component tests. The overlay, the tile and the settings section are driven
  in a real browser against `yarn dev`, per this codebase's posture.

## What Was Rejected

**A stored red event.** Covered above: it goes stale against its own inputs and
it puts an unobserved claim in an append-only observation log.

**A stored red, reconciled on every change.** Re-evaluating and deleting the
auto-red whenever a window yellow or the setting moves would get both halves —
at the cost of the only mutable behaviour event in the table, plus
reconciliation code on every yellow write and every settings save. The derived
answer needs neither.

**Per-pupil windows that skip absences**, **timetable-based windows**, **a slate
wiped clean after a red**, **per-class rules**, **`localStorage`**, **an
*Annuler* on the overlay**, and **an overlay that waits to be dismissed** — each
argued in place above.

**Putting the derived red into the counts and the pupil page timeline.** It
would be the most visible option and it would break the one thing that makes
this design safe: that the log and the export only ever say what somebody
actually observed.
