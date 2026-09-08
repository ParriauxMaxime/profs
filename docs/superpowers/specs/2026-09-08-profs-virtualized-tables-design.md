# profs — Classes and Élèves as tables, virtualized (design)

**Date:** 2026-09-08
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
pages on it, and — at the user's direction — makes it **virtualize every table
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
whenever anything above the table changes height — the filter appearing, a
`ClassForm` opening. Omit it and the
virtualizer computes its window off by the height of the heading, the search box
and the filter above it, which presents as a table that is blank until you have
scrolled well past its top. This is the single easiest thing here to get wrong.

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
touch and `py-2.5` on desktop, and a wrapping surname or a row of group chips is
taller than its neighbours. `estimateSize: () => 48` is the opening guess and
`measureElement` corrects it.

## The Ruling: Every Column Declares a Width

`table-layout: fixed`, and `size` becomes **mandatory** on every column
definition.

Automatic table layout sizes columns from the rows it can see. With a moving
window it can only ever see twenty of them, so the columns visibly resize as the
teacher scrolls — the worst class of bug this app can ship, because it looks
like the app is broken rather than like a mistake anyone could name.

`DataTable` currently applies `size` only when it differs from TanStack's 150
default, a hack that exists because widths were optional. It goes. Width is
applied unconditionally through a `<colgroup>`, which is where a fixed-layout
table wants it.

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
navigate twice and the roster's delete button keeps working.

The rejected alternative, a `<Link>` stretched to fill every cell, is genuinely
accessible and puts one tab stop per cell — on `/students`, three per row across
360 rows.

## Accessibility

Virtualization breaks two things that a plain table gives away.

**Row counting.** The DOM holds twenty rows out of 360, so a screen reader
announces "row 4 of 12" for the two-hundredth pupil. `aria-rowcount` goes on the
`<table>` (`rows.length + 1`, counting the header), `aria-rowindex` on the header
row (`1`) and on each data row (`virtualItem.index + 2`). Spacer rows are
`aria-hidden`.

**Find in page.** ⌘F cannot find a pupil who is not rendered, and there is no fix
for this — only a mitigation. The table's own search box stays directly above the
table on both pages rather than tucked in beside the filter, because it is now
the only way to find a name.

## The Two Pages

**`/classes`** is Nom and Élèves. The row type is `SchoolClass & { headcount:
number }` so that the count sorts as a number rather than as a rendered cell.
`globalSearchFields: ["name"]` is the requested name filter, and it is the search
box `DataTable` already draws. "Ajouter une classe" and `ClassForm` stay above
the table, unchanged.

**`/students`** is Nom, Prénom and Classe. The row type is `Student & {
classLabel: string }`, resolved once in the live query, which does two things at
once: it keeps today's accent-insensitive search over the class name
(`globalSearchFields: ["lastName", "firstName", "classLabel"]`), and it makes
Classe a sortable column instead of a lookup buried in a cell.

The field is `classLabel` and not `className` deliberately. A data field named
`className` in a React component is a reader's trap, and this codebase has
renamed for less — `SchoolClass` over `class`, `Desk` over `Table`.

The class filter is a `<select>` beside the search, chosen over the `ToggleGroup`
used for groups because sixteen classes wrap to three rows of chips and a
seventeenth is one term away. It filters the array **before** the data reaches
`DataTable`. It holds a **class id, never an index**, and falls back to "Toutes"
when the held class no longer exists — the rule `resolveGroupSelection` already
applies, for the reason CLAUDE.md gives at length. It renders only when the
workspace has two or more classes, since a filter with one option is a control
that does nothing.

Surnames go through `PupilName` as everywhere else, so the capitals stay CSS and
sorting and search still read what the teacher typed.

Neither table carries edit or delete actions. Both live on the detail pages, one
click away, and a destructive control in a 360-row list is a mis-tap waiting to
happen.

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
adds a domain rule, so the suite gains no tests, and the gate
`yarn format && yarn lint && yarn typecheck && yarn test` must stay green.

Verification is a real browser against `yarn dev` on the 360-pupil seed:

- the full list scrolls top to bottom with no blank band and no column jitter
- sorting and filtering with the window mid-list keep the right rows on screen
- a row click lands on `/classes/:id` and `/students/:id`
- Tab reaches the first-cell link and Enter follows it
- the class roster is unregressed, now that its columns have widths
- the class `<select>` and the search compose, and survive a class being deleted

A GIF of the scroll goes to the author, because "no jitter" is a claim better
shown than asserted.

## What This Costs, Stated Plainly

Three permanent costs, on every table in the app, accepted deliberately:

1. Every column definition must declare a width, forever.
2. ⌘F no longer finds rows outside the rendered window.
3. Row-count accessibility is now hand-maintained rather than free.

They buy a `/students` page that stays fluid at 360 rows and would stay fluid at
3,600. Whether 360 rows needed it was never measured — the author chose the
infrastructure over the measurement, and the measurement will fall out of
verification anyway. If it turns out to be small, this section is where to start
unwinding.
