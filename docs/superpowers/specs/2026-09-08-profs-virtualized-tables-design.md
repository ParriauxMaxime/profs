# profs — Classes and Élèves as tables, virtualized (design)

**Date:** 2026-09-08
**Revised:** 2026-09-09, after a design interrogation that changed six decisions
**Status:** Approved, ready for implementation planning
**Follows:** the music-college seed (`03d13b9`, merged), which is what makes this necessary

## What This Is

`/classes` and `/students` each render a grid of cards. The request:

> for /classes and /students pages, we should favorise a table instead of grid
> cards. For classes, we want to be able to filter by name, for students, filter
> by name and/or class. Clicking on a row should redirect to the classes/:id or
> students/:id page.

Cards suited a two-class demo. The music teacher's collège has sixteen classes
and **360 pupils**, and 360 cards in a three-column grid is a wall — a teacher
looking a child up before a parents' evening scans a column, not a mosaic. A
table also sorts, which a grid cannot.

`DataTable` already exists and already sorts and searches. This spec puts both
pages on it, and — at the author's direction — makes it **virtualize every table
it renders**.

Every existing constraint binds: local-only, IndexedDB, **no network request of
any kind**, `fr` default with `en` alongside, no blocking browser dialogs, 44px
live-entry tap targets, writes in `src/db/` and never in a component, and
`PupilName` as the only place a pupil's name is composed.

## The Ruling: Virtualization Is Unconditional

`DataTable` virtualizes always. There is no `virtualized` prop, no threshold,
no escape hatch.

The alternative — an opt-in flag — was considered and rejected for one reason:
a flag that changes a component's *contract* is a trap. Virtualization requires
every column to declare a width (below), so `virtualized` would mean "and now
`size` is mandatory". The next person to flip it on a table gets jittering
columns and no error telling them why. One code path has one set of rules.

The cost is paid where it buys nothing, and is accepted with open eyes. A
gradebook is one class by one subject, so its grid is roughly twenty-three rows;
the class roster and the seating plan are one class each. **`/students` is the
only surface in this app that has ever held 360 rows.** Every other table pays
the fixed widths and the lost ⌘F for a saving it cannot measure.

That is the trade the author chose over a second, subtly different `DataTable`.
Reversing it is cheap and this paragraph is the argument for doing so, should
the small tables ever start to hurt.

Note the boundary this ruling does *not* draw. `globalFilter` becomes optionally
controlled (below), which is also a prop that changes behaviour by its presence
— and that is fine. A controlled/uncontrolled split is an idiomatic React
pattern that fails **visibly**: pass the value without the handler and the input
freezes on the first keystroke. `virtualized` would have failed **silently**,
as columns twitching during a scroll. Traps are about the failure mode, not
about optional props.

## The Ruling: The Window Scrolls, Not a Box

`useWindowVirtualizer`, never the scrollbox kind.

`AdminLayout` is `min-h-screen` around a `main` that scrolls in the document;
nothing in this app has ever scrolled inside a fixed-height panel. A classic
virtualizer needs one, and on the tablet this app is for, a scroll region nested
inside a scrolling page is the gesture teachers already hate in Pronote. The
window virtualizer keeps the page scrolling exactly as it does today, and
`AdminLayout` is not touched.

**`scrollMargin` is load-bearing.** A window virtualizer measures against the
document, so it must be told how far down the page the table starts —
`tableRef.current.offsetTop`, read through a layout effect and recomputed
whenever anything above the table changes height: the class filter appearing,
a `ClassForm` opening. Omit it and the virtualizer computes its window off by
the height of the heading, the search box and the toolbar above it, which
presents as a table that is blank until you have scrolled well past its top.
This is the single easiest thing here to get wrong.

## The Ruling: Spacers, Not Transforms

The virtual window's height is absorbed by one empty `<tr>` above the rendered
rows and one below:

```
<tbody>
  <tr aria-hidden><td colSpan={n} style={{ height: paddingTop }} /></tr>
  …the ~20 rows actually in view…
  <tr aria-hidden><td colSpan={n} style={{ height: paddingBottom }} /></tr>
</tbody>
```

The recipe every virtualization tutorial reaches for instead — absolutely
positioning each `<tr>` and moving it with `transform: translateY` — cannot work
inside a `<table>`. A positioned row leaves the table's layout, so it stops
participating in column sizing, and the header then aligns with nothing.

Spacers keep `<table>`, `<tr>` and `<td>` intact, which is what preserves the
header row, `aria-sort` and column alignment without writing any of them again.

Row heights come from `measureElement`, not a constant. Rows are `py-3.5` on
touch and `py-2.5` on desktop, and because columns are proportional (below) a
long surname wraps rather than widening its column. `estimateSize: () => 48` is
the opening guess and `measureElement` corrects it.

## The Ruling: Columns Declare a Ratio, Not a Width

`table-layout: fixed`, a `<colgroup>`, and `size` on every column definition —
read as a **unitless ratio**, normalised to percentages:

```
width = size / Σ sizes × 100 %
```

Automatic table layout sizes columns from the rows it can see. With a moving
window it can only ever see twenty of them, so the columns visibly resize as the
teacher scrolls — the worst class of bug this app can ship, because it looks
like the app is broken rather than like a mistake anyone could name.

But the jitter comes from widths depending on **content**, not from their unit,
and pixels were the wrong fix. The app is used on a phone as well as a tablet:
at 375px the roster's four columns include an actions cell holding two buttons,
and pixel widths guarantee a horizontal scrollbar under a thumb already scrolling
vertically. Percentages fit any container at any width, jitter no more than
pixels do, and cost only that long names wrap — which `measureElement` already
absorbs.

`size` is reused rather than a parallel `meta.width` invented, so there is one
place a column's width is expressed. TanStack's 150 default becomes meaningful:
columns that all leave it alone simply share the width equally. `DataTable`
currently applies `size` only when it differs from 150 — that hack goes.

This reaches the one table already in the tree: the class roster's four columns
(surname, first name, groups, actions) have never declared a width and now must.

## The Ruling: The Row Is Not the Link

A `<tr>` cannot be an anchor. It takes no focus, Enter does not fire on it, and
`role="link"` merely tells a screen reader a lie about an element that still has
no href, no hover URL and no ⌘-click.

So the first cell of every row holds a real `<Link>` — `Router.Class` on
`/classes`, `Router.Student` on `/students` — and the `<tr>` takes an
`onRowClick` on top of it as a mouse convenience. Keyboard users tab to the link
and press Enter; everyone else clicks anywhere in the row. The handler ignores
events that originate inside an `<a>` or a `<button>`, so the first cell does not
navigate twice and a row carrying controls keeps them working.

The rejected alternative, a `<Link>` stretched to fill every cell, is genuinely
accessible and puts one tab stop per cell — on `/students`, three per row across
360 rows.

## The Ruling: A List Page's Filter Lives in Its URL

`Classes: "/classes?:q"` and `Students: "/students?:q&:classe"`.

Row-click navigation makes "go in, come back" the primary loop, and a teacher
who typed six characters to find a pupil should not retype them after looking at
that pupil. Chicane restores search params on Back for free, and the app already
names state this way — `Class` carries `?date=` and `?at=` for exactly this
reason.

Three consequences, each deliberate:

**The write is `replace`, never `push`.** Typing "bernard" through a pushing
router stacks seven history entries and Back then walks them one character at a
time. Replace keeps one entry per page, which is what Back is for.

**`classe` carries a class id, not a name.** `classes: "id, name"` — the name is
indexed but **not unique**, so two classes may share one and a name could not
name a class unambiguously. The id is unreadable, and that costs nothing here:
the app is local-only with no accounts, so the URL's only reader is the Back
button. An id naming a class that no longer exists falls back to "Toutes", the
rule `resolveGroupSelection` already applies elsewhere.

**Scroll position is not restored, and that is accepted.** The filters come
back; the offset does not. Restoring it properly means persisting a *student id*
rather than a row index — an index is meaningless once the list has changed
underneath it, which is the position-versus-identity bug CLAUDE.md catalogues in
five disguises — and then calling `scrollToIndex` after the live query resolves.
That is a feature, not a detail, and the search box makes deep scrolling rare
enough that it can wait for evidence it is needed.

Both pages are URL-backed, including `/classes` with its sixteen rows where it
barely matters. Symmetry is the point: two list pages that answer Back
differently is a question a reader has to hold, and the controlled props are
then exercised the same way in both places rather than on one page only.

## The Ruling: The Header Stays

`position: sticky` on the `<thead>` cells, with an opaque background.

Scrolling 360 rows past a header that has left the screen means the Classe
column becomes a bare list of names, and re-sorting means scrolling back to the
top to reach a control. The header lives outside the virtualized `<tbody>`, so
it costs the virtualizer nothing.

It rests **below** the floating hamburger rather than at `top: 0`. That button
is `fixed top-0 left-0 z-30`, 44px plus safe-area inset, sitting exactly where a
flush header would land — on a narrow screen it would cover the "Nom" label and
its sort control. The offset is
`calc(max(0.5rem, env(safe-area-inset-top)) + var(--control-min) + 0.5rem)`, the
same expression `AdminLayout` already uses for its `main` padding, so no new
constant enters the app and the header stays correct if the control size ever
changes.

## Accessibility

Virtualization breaks two things that a plain table gives away.

**Row counting.** The DOM holds twenty rows out of 360, so a screen reader
announces "row 4 of 12" for the two-hundredth pupil. `aria-rowcount` goes on the
`<table>` and counts the **filtered** rows plus the header, since that is the
list the teacher is actually in; `aria-rowindex` goes on the header row (`1`) and
on each data row (`virtualItem.index + 2`). Spacer rows are `aria-hidden`.

**Find in page.** ⌘F cannot find a pupil who is not rendered, and there is no fix
for this — only a mitigation. The search box stays directly above the table on
both pages rather than tucked away, because it is now the only way to find a
name.

## The `DataTable` API After This

Four additions, all optional, none changing an existing caller's behaviour:

| Prop | Purpose |
|---|---|
| `toolbar?: ReactNode` | Rendered in the search input's flex row, for a page's own filters |
| `onRowClick?: (row: T) => void` | Mouse convenience over the first cell's `<Link>` |
| `globalFilter` / `onGlobalFilterChange` | Optionally controlled, so the value can live in the URL |
| `noResultsMessage?: ReactNode` | Replaces the generic "Aucun résultat" |

Virtualization, `table-layout: fixed`, the `<colgroup>`, the sticky header and
the ARIA row indices are unconditional and take no prop.

## The Two Pages

**`/classes`** is Nom and Élèves. The row type is `SchoolClass & { headcount:
number }` so that the count sorts as a number rather than as a rendered cell.
The search is the requested name filter, controlled from `?q`.

Default order is **plain alphabetical on name**, which puts 3°A first and so
inverts how a collège lists its classes — the seed's own `LEVELS` run 6e, 5e,
4e, 3e. Ordering by level was offered and declined: it would need a
`compareClasses` domain helper parsing a leading number out of an **optional
free-text** `level` field, and the column header sorts both ways with one click
regardless. Recorded here so the ordering reads as a choice rather than an
oversight.

"Ajouter une classe" and `ClassForm` stay above the table, unchanged — noting
that the form opening is one of the height changes `scrollMargin` must react to.

**`/students`** is Nom, Prénom and Classe. The row type is `Student & {
classLabel: string }`, resolved once in the live query, which does two things at
once: it keeps today's accent-insensitive search over the class name
(`globalSearchFields: ["lastName", "firstName", "classLabel"]`), and it makes
Classe a sortable column instead of a lookup buried in a cell.

The field is `classLabel` and not `className` deliberately. A data field named
`className` in a React component is a reader's trap, and this codebase has
renamed for less — `SchoolClass` over `class`, `Desk` over `Table`.

The class filter is a `<select>` in the `toolbar` slot, beside the search,
chosen over the `ToggleGroup` used for groups because sixteen classes wrap to
three rows of chips and a seventeenth is one term away. It filters the array
**before** the data reaches `DataTable`. It holds a **class id, never an index**,
mirrored to `?classe`, and falls back to "Toutes" when the held class no longer
exists. It renders only when the workspace has two or more classes, since a
filter with one option is a control that does nothing.

The no-results message keeps today's echo of the query — « Aucun élève ne
correspond à "bern" » — through `noResultsMessage` and the existing
`students.noMatch` key, rather than degrading to the generic string. The echo is
how a teacher notices they typed *brenard*. The class filter needs no mention in
it, since the select visibly shows what it is set to.

Surnames go through `PupilName` as everywhere else, so the capitals stay CSS and
sorting and search still read what the teacher typed.

Neither table carries edit or delete actions. Both live on the detail pages, one
click away, and a destructive control in a 360-row list is a mis-tap waiting to
happen.

## What the Class Roster Gets

`/classes/:classId/eleves` is the one table already on `DataTable`, and it gets
**column widths and nothing else**. No `onRowClick` is passed; its surname cell
goes on opening a `StudentCard`.

Making a row click open the card there was offered and declined, as was making
it navigate. Both would have bought uniformity across three tables at the price
of touching a screen nobody asked to change. The visible consequence is accepted:
a teacher who learns on Élèves that rows are clickable finds a row on the roster
that is not. If that grates in use, `onRowClick={s => setCardStudentId(s.id)}` is
a one-line change.

## The Dependency

`@tanstack/react-virtual` v3, from the maintainers of `@tanstack/react-table`,
roughly 5KB.

It is a **build-time** dependency and issues no request at runtime. The
no-network rule governs what the app does on a teacher's device, not what the
bundler reads from disk, and adding a package is not the violation a font CDN or
an analytics call would be. This paragraph exists so that nobody reading the
dependency list later has to relitigate it.

## Testing

The standing posture holds: domain and `src/db` are TDD, and **there are
deliberately no component tests**. Nothing here touches `src/db` and nothing here
adds a domain rule — the one candidate, `compareClasses`, was declined with the
alphabetical ordering — so the suite gains no tests, and the gate
`yarn format && yarn lint && yarn typecheck && yarn test` must stay green.

Verification is a real browser against `yarn dev` on the 360-pupil seed:

- the full list scrolls top to bottom with no blank band and no column jitter
- sorting and filtering with the window mid-list keep the right rows on screen
- the sticky header clears the ☰ button and covers no row content
- a row click lands on `/classes/:id` and `/students/:id`
- Tab reaches the first-cell link and Enter follows it
- Back from a pupil restores `?q` and `?classe`, and the history holds one entry
  per page rather than one per keystroke
- at 375px both tables fit with no horizontal scrollbar
- the class roster is unregressed, now that its columns have widths
- the class `<select>` and the search compose, and survive a class being deleted

A GIF of the scroll goes to the author, because "no jitter" is a claim better
shown than asserted.

## What This Costs, Stated Plainly

Four permanent costs, accepted deliberately:

1. Every column definition must declare a ratio, forever.
2. ⌘F no longer finds rows outside the rendered window.
3. Row-count accessibility is now hand-maintained rather than free.
4. Back restores the filters but not the scroll offset.

They buy a `/students` page that stays fluid at 360 rows and would stay fluid at
3,600. Whether 360 rows needed it was never measured — the author chose the
infrastructure over the measurement, and the measurement will fall out of
verification anyway. If it turns out to be small, this section is where to start
unwinding.
