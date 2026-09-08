# Salles et plans de table

Design, 2026-09-08. Supersedes the room half of phase 8.

Mockups: <https://claude.ai/code/artifact/ae8456fe-3f01-419a-9d73-6f2e0c18d922> — five
artboards in the app's own tokens and its real Luciole faces. The salle editor's
free floor is computed there by the actual `canPlace`, so the drawing cannot
show a placement the app would refuse.

## The problem

The seating plan serves three activities and offers two modes.

| Activity | Frequency | Where it lives |
|---|---|---|
| Run the lesson — attendance, behaviour | every hour | bare tap on a pupil opens their card |
| Arrange pupils — who sits where | a few times a term | split: the card's *Déplacer*, the rail, or `↩` in layout-edit mode |
| Furnish the room — tables, aisles, templates | once | layout-edit mode, `×`, the template form |

The mode boundary is drawn in the wrong place. The button says *Modifier le plan* — which a teacher reads as **who sits where** — but what it turns on is **furniture editing**, and it does so by silently redefining a tap on a pupil to mean "pick up the table underneath them". Same pixel, same tile, two objects.

Everything else follows from that overload: three `Held` kinds, three hint sentences, two near-identical corner buttons whose difference needs a paragraph of CLAUDE.md, and floor tiles meaning *add* or *move* or nothing depending on invisible state. Phase 8 made it worse by adding two more bars to the same screen.

## The split

A **salle** is physical. It has 28 tables in an arc and it exists whether or not 3°B is in it. A **plan de table** is 3°B poured into that salle. Moving Adam away from Lucas mid-lesson is neither — it is the lesson.

So: furniture lives on its own screen with **no pupils on it**, and the class tab holds pupils with **no furniture on it**. Each screen then has one mode, because on each screen a tap has only one thing it could mean.

## Data model

Four stores replace two.

```
Room          id, name, width, height              "204" — belongs to the workspace
Desk          id, roomId, x, y                     furniture. No studentId.
SeatingPlan   id, classId, roomId                  3°B's arrangement in 204
Assignment    [planId+deskId] → studentId          who sits where
```

**`Desk`, not `Table`.** A Dexie store named `tables` would shadow `db.tables`, which `wipeWorkspace` and the backup's clear list both read — a silent, total break. Same reason `SchoolClass` is not `class` and `GradeColumn` is not `Column`. The French UI still says *table*; only the identifier changes.

**Two unique indexes, both load-bearing.** `&[roomId+x+y]` keeps v8's guarantee that no two desks share a point, so a `canPlace` bug surfaces as a rejected write rather than as a pupil nobody can tap. New: `&[planId+studentId]`, so the database itself refuses to seat one pupil in two chairs — an invariant previously enforced only by careful code.

The index has a consequence every seating path must respect: **assigning an already-seated pupil throws unless the write clears their old assignment first.** That is the index doing its job. Every seat/swap is one transaction that deletes then puts.

**`Assignment` copies `Grade` exactly.** Compound primary key, one-row `put` to seat, one-row `delete` to unseat, never a read-modify-write of a collection.

**One plan per (class, salle).** A class taught in two salles has two plans, and the plan is chosen by choosing the salle — no naming, no switcher, no create flow. Several named arrangements of the *same* salle were considered and cut: a contrôle seating means rearranging and rearranging back, which is cheaper than a feature.

Which salle a class opens in is a per-device selection anchored by id, in `localStorage`, for the same reason the term anchor and the theme are: it describes this device's view, has no relations, and losing it costs one tap. `active-layout.ts` becomes `active-room.ts` almost verbatim, keyed class → salle, and `resolveActiveRoom` still falls back when the stored id names nothing.

### Cascades

`deleteClass` takes its plans and their assignments. `deleteStudent` deletes its assignments rather than nulling a column. A new `deleteRoom` takes its desks, every plan in it, and those plans' assignments, with the `ConfirmButton` naming the classes that lose an arrangement.

`deleteRoom` **cascades rather than refuses**, unlike `deleteSubject`. Destroying gradebooks as a side effect of removing a subject is too much to do implicitly; destroying seating arrangements is not — they are rebuilt in a minute, and refusing would strand a salle a teacher no longer uses behind classes they no longer teach.

## What this supersedes

Phase 8 shipped `Room` at v9 as a **user-defined template**: positions embedded, stamped through `applyTemplate`, no back-reference, "stamps and ceases to exist". That is the opposite answer to the same question. It is coherent, and it is not what a shared salle means: editing 204 must change what 3°B and 5°A both see, which a stamp cannot do.

The name survives, the meaning changes. `Room.positions` becomes the `desks` table, because a desk now needs an id to be assigned against.

`SavedRoom`'s management UI in Réglages is removed; the salle editor replaces it.

## Migration

`seats`, `seatingLayouts` and `rooms` all change shape, so all three are dropped. The sanctioned two-version dance:

```
db.version(10).stores({ seats: null, seatingLayouts: null, rooms: null });
db.version(11).stores({
  rooms:        "id, name",
  desks:        "id, roomId, &[roomId+x+y]",
  seatingPlans: "id, classId, roomId, &[classId+roomId]",
  assignments:  "[planId+deskId], planId, deskId, studentId, &[planId+studentId]",
});
```

**Every existing seating plan is destroyed.** That is what "disposable, not migrated" means. A one-off upgrade lifting each layout into a room was considered — perhaps thirty lines, and it would work — and rejected: it punches the first hole in a rule the codebase has held absolutely, and the next person will cite it. The cost is stated plainly rather than buried: a teacher who spent a term arranging 28 pupils opens the app to an empty room.

`rooms` is dropped even though its key did not change, for the reason `seatingLayouts` was: a store whose **shape** changed must be dropped, or Dexie carries a v9 row forward and `room.positions` feeds code reading `desks`.

A `v9 → v11` regression test in `src/db/index.test.ts` builds a real v9 database with `fake-indexeddb` and opens it with current code — one per store whose shape moved. That seam is the documented blind spot.

Backup: four tables added to the export literal by hand, plus seeded rows in the wipe test and the schema table-list test, which fail until you do.

## One placement rule

`Held` has three kinds today and the rail needs three hint sentences, because seating from the rail *displaces* and seating from a table *swaps*. Those were never two rules. They are one rule with a null in it.

```ts
interface HeldPupil {
  studentId: string;
  /** The desk they were lifted from, or null when lifted from the rail. */
  fromDeskId: string | null;
}
```

**Drop a held pupil on a desk: whoever was sitting there goes where the held pupil came from.** From a desk, they swap. From the rail, "where they came from" is the rail, so the occupant is displaced there. One sentence, one function, one hint — *« Posez-le sur une place. Les deux élèves permutent. »*

`resolveFloorDrop` disappears: on this screen there is no floor. Furniture gets its own state on its own screen, `heldDeskId`, sharing nothing. The union that spanned both screens is what let one tap mean two things.

### The class tab

| Gesture | Meaning |
|---|---|
| tap a rail chip | lift that pupil |
| tap a seated pupil | open their card |
| card → **Déplacer** | lift them |
| tap any desk, holding someone | place them, by the rule above |
| card → **Retirer de sa place** | back to the rail |
| Escape | put them down |

A tap on a pupil opens their card — always, with no exception, because that is the gesture of the lesson itself. *Déplacer* is the card's primary action, above the register: mid-lesson rearrangement is frequent and has no other path. *Retirer de sa place* replaces `↩`, and reads as an action on a pupil rather than a symbol on a tile.

No mode toggle, no `×`, no floor slots, no template form. The screen a teacher touches every hour loses every control that could damage the room.

## The salle editor

Drag is the primary gesture; **tap-to-pick-up is retained as its equivalent**, sharing `heldDeskId`.

This departs from CLAUDE.md, which rules out drag and drop because the browser automation cannot drive it and there are no component tests. That ruling was written for the plan a teacher taps mid-lesson. The salle editor is a different screen, used once, sitting down. Keeping the tap path costs nothing — the state already exists — leaves the screen driveable in tests, and supplies the keyboard equivalent the ruling asks for regardless.

Furniture is dragged from an **Ajouter** palette onto the floor and lands where the cursor is, so nothing enumerates candidate positions: `floorSlots` leaves the pointer path entirely, and with it the three-state slot label including the inert *pupil-in-hand* case, which can no longer arise.

Controls appear on the **selected** table only, not stamped on all twenty-four. That was most of the clutter.

`frame()`'s margin goes from one unit to two. With one, a fully stamped room has zero placeable positions and lifting a desk offers two squares a hair either side of where it already was. Less load-bearing now that drops land at the cursor, but a room still needs floor to drop onto.

## Merging

Two desks exactly `TABLE` apart render as **one continuous surface**: no internal border, outer corners rounded, and a chair on the near edge of each place marking where one place ends. Any contiguous group merges, so *tables de deux*, *îlots* and a *fer à cheval* all fall out of adjacency rather than each needing its own drawing rule.

**The merge is a rendering, never a datum.** Two adjacent desks are two places, two `Assignment` rows, two pupils. If merging changed capacity, "is this one table or two" would become a question the assignment model has to answer, and it would answer it wrong every time a desk moved.

Grouping is one pure function in the domain: connected components over edge-sharing desks, returning each component and which internal edges to suppress. Testable, and the only genuinely new geometry.

### Adjacency is already legal

`overlaps` tests `|dx| < TABLE`, so two desks exactly `TABLE` apart already pass `canPlace`. No geometry changes. What plants a unit of air between every desk is the **generators**: `buildRows`, `buildIslands` and `buildU` all step by `PITCH = TABLE + 1`.

They change to space *between groups* rather than between desks. `rows` gains a `perTable` parameter (default 2 — the standard French *table de deux*) and its `cols` becomes tables-per-row.

A consequence worth naming: **the current `îlots` template does not make islands.** It makes 2×N desks with aisles between them. Edge-to-edge groups will make it produce an actual block.

`ARC_SPACING` and sub-cell arc positions stay. The grid is the snap default, not the only legal coordinate.

## Navigation

**Salles** becomes a seventh drawer destination: Aujourd'hui, Classes, Élèves, Emploi du temps, Journal, **Salles**, Réglages.

This looks like a violation of the rule that keeps workspace management out of the drawer, and is not: that rule is about *configuration*. Once furniture belongs to the établissement rather than to a class, a salle is *content*, like Élèves — a thing the app is about, not a setting for it. `/salles` lists them; `/salles/:roomId` is the editor.

## The room as a room

The room surface is drawn top-down with material: a tiled floor whose 36px seams **are** the coordinate grid, wooden tables with a far-edge highlight, a front edge and a floor shadow, chairs marking places, and a green *tableau* in a wooden frame at the top.

The warm palette is scoped to the room surface. Every control around it keeps the app's tokens, and selection keeps `--color-accent`, so interaction reads as interface and material reads as room.

**Outstanding: the ardoise values.** Dark oak, dim floor, a nearly-black board. A dark classroom is exactly the projector case the theme exists for, and the mockups do not cover it yet.

## What gets deleted

- the `Held` union and its three kinds
- `resolveDrop` **and** `resolveFloorDrop`
- the `resizing` state and the `editing` prop threaded through `RoomView`
- the `↩` free-seat control
- `floorSlots` from the pointer path, and the slot label's three states
- `LayoutBar`, `SavedRoomsBar`, and Réglages' saved-room section
- two of the rail's three hints
- CLAUDE.md's paragraph explaining that a bare tap means different things in different modes

`room-view.tsx` splits into a `RoomCanvas` owning the floor, the scale and the board, plus two thin tile layers sharing no gesture code.

## Testing

- **domain** — `resolvePlacement` table-driven across from-rail / from-desk × empty / occupied / self; the merge grouping over rows, blocks, horseshoes and singletons; `resolveActiveRoom` fallback; generators producing edge-to-edge groups with air between them; `reseat` overflow reported per plan, since stamping 204 reseats every class using it
- **db** — assign / unassign / swap against `&[planId+studentId]`, including the delete-then-put ordering; `deleteRoom`, `deleteClass`, `deleteStudent` cascades; the `v9 → v11` regression test
- **backup** — the four tables in the export literal, the wipe test and the schema table-list test
- **UI** — driven in a real browser against `yarn dev`; the tap path exists partly so this stays possible

## Accepted losses

- every existing seating arrangement, at the migration
- several named arrangements of one salle, which phase 8 had just shipped
- a smooth arc is still expressible, but templates now think in groups, so the arc generator needs revisiting rather than reuse
