# Virtualized Tables for /classes and /students — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card grids on `/classes` and `/students` with sorted, filtered, row-clickable tables, and make `DataTable` virtualize every table it renders.

**Architecture:** `DataTable` (`src/modules/design-system/components/data-table.tsx`) gains window-based virtualization with spacer rows, `table-layout: fixed` with proportional `<colgroup>` widths, a sticky header, ARIA row indices, and four optional props (`toolbar`, `onRowClick`, controlled `globalFilter`, `noResultsMessage`). Both list pages then move onto it, with their filters mirrored into Chicane search params.

**Tech Stack:** React 19, TypeScript, TanStack Table v8, TanStack Virtual v3 (new), Dexie + `useLiveQuery`, Chicane router, Tailwind v4, i18next, Jest (node env).

**Spec:** `docs/superpowers/specs/2026-09-08-profs-virtualized-tables-design.md` — read it before Task 1. The plan implements it; the spec carries the reasoning.

## Global Constraints

- **No network request of any kind at runtime.** Adding a build-time npm package is fine; a CDN font, an `img` pointing off-device, or a `fetch` is not.
- **No blocking browser dialogs.** Never `window.confirm`, `alert`, or `beforeunload` — they freeze the browser automation used to verify these pages.
- **There are deliberately NO component tests.** Jest runs in the `node` environment with no jsdom and no testing-library installed. Do **not** add one, and do **not** install jsdom. The only new unit test in this plan is for a pure function in `src/domain/`.
- **Every user-visible string goes through `t()`**, and every key must exist in BOTH `src/i18n/locales/fr.json` and `src/i18n/locales/en.json`. A parity test fails the build otherwise.
- **A pupil's name is only ever composed by `PupilName`** (`src/modules/design-system/components/pupil-name.tsx`). Never `toUpperCase()`; the capitals are CSS.
- **State bound to a record is keyed by that record's id, never by its index or position.** This applies to the selected class in the filter.
- **Validation gate — all four must be green before any task is complete:**
  `yarn format && yarn lint && yarn typecheck && yarn test`
- **Node is not on the default PATH.** Prefix every command:
  `export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"`
- **Identifiers are English; only translation values are French.**
- Existing baseline at the start of this plan: **611 tests, 47 suites, all passing.**

---

### Task 1: `columnWidths` — proportional column widths

Pure ratio-to-percentage math, in `src/domain/` because that is the only place in this repo with real unit tests.

**Files:**
- Create: `src/domain/table-layout.ts`
- Test: `src/domain/table-layout.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `columnWidths(sizes: number[]): string[]` — takes TanStack column sizes read as unitless ratios, returns CSS percentage strings that sum to 100%.

- [ ] **Step 1: Write the failing test**

Create `src/domain/table-layout.test.ts`:

```ts
import { columnWidths } from "./table-layout";

describe("columnWidths", () => {
  it("splits equal sizes into equal percentages", () => {
    expect(columnWidths([150, 150, 150])).toEqual(["33.3333%", "33.3333%", "33.3333%"]);
  });

  it("weights columns by their share of the total", () => {
    expect(columnWidths([50, 25, 25])).toEqual(["50.0000%", "25.0000%", "25.0000%"]);
  });

  it("gives a single column the full width", () => {
    expect(columnWidths([150])).toEqual(["100.0000%"]);
  });

  it("returns nothing for no columns", () => {
    expect(columnWidths([])).toEqual([]);
  });

  // A column that declares 0, or a caller that hands us all zeroes, must not
  // produce NaN% — which CSS drops silently, handing the table back to
  // automatic layout and the scroll jitter this whole mechanism exists to
  // prevent.
  it("falls back to equal shares when the sizes sum to zero", () => {
    expect(columnWidths([0, 0])).toEqual(["50.0000%", "50.0000%"]);
  });

  it("never emits NaN for a negative total", () => {
    expect(columnWidths([-10, -10])).toEqual(["50.0000%", "50.0000%"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn test src/domain/table-layout.test.ts
```

Expected: FAIL — `Cannot find module './table-layout'`.

- [ ] **Step 3: Write the implementation**

Create `src/domain/table-layout.ts`:

```ts
/**
 * Column widths for a `table-layout: fixed` table, as percentages.
 *
 * `DataTable` virtualizes every table it draws, so at any moment the browser
 * can see about twenty rows out of however many there are. Automatic table
 * layout sizes a column from the rows it can see, which means the columns
 * visibly resize as the teacher scrolls — the worst kind of bug to ship,
 * because it reads as the app being broken rather than as a mistake anyone
 * could name.
 *
 * The fix is widths that do not depend on content. They are PERCENTAGES rather
 * than pixels because this app is used on a phone as well as a tablet: pixel
 * widths guarantee a horizontal scrollbar under a thumb that is already
 * scrolling vertically, while percentages fit any container at any width and
 * jitter no more than pixels do. The cost is that a long surname wraps, which
 * the virtualizer's `measureElement` already absorbs.
 *
 * TanStack's `size` is therefore read as a unitless RATIO, not as pixels. Its
 * default of 150 is meaningful under that reading: columns that all leave it
 * alone simply share the width equally.
 */
export function columnWidths(sizes: number[]): string[] {
  if (sizes.length === 0) return [];

  const total = sizes.reduce((sum, size) => sum + size, 0);
  // A zero or negative total would divide into NaN, and CSS drops a NaN width
  // silently — handing the table straight back to automatic layout and the
  // jitter this function exists to prevent. Equal shares are a poor layout;
  // they are not a broken one.
  if (total <= 0) return sizes.map(() => `${(100 / sizes.length).toFixed(4)}%`);

  return sizes.map((size) => `${((size / total) * 100).toFixed(4)}%`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
yarn test src/domain/table-layout.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests (611 + 6).

- [ ] **Step 6: Commit**

```bash
git add src/domain/table-layout.ts src/domain/table-layout.test.ts
git commit -m "feat(domain): column widths as ratios, never pixels"
```

---

### Task 2: `DataTable` virtualizes

The core change. After this task the class roster still renders and still works — its four columns simply share the width equally until Task 5 tunes them.

**Files:**
- Modify: `package.json` (add dependency)
- Modify: `src/modules/design-system/components/data-table.tsx`

**Interfaces:**
- Consumes: `columnWidths(sizes: number[]): string[]` from `@domain/table-layout` (Task 1).
- Produces: a `DataTable` whose public props are unchanged, that renders `table-layout: fixed` with a `<colgroup>`, virtualizes its rows against the window, and carries `aria-rowcount` / `aria-rowindex`.

- [ ] **Step 1: Add the dependency**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn add @tanstack/react-virtual
```

Verify it is a **runtime** dependency (it ships in the bundle) and that nothing else changed:

```bash
git diff package.json
```

Expected: one added line under `dependencies`, `"@tanstack/react-virtual": "^3.x.x"`.

- [ ] **Step 2: Add the virtualization imports and constants**

In `src/modules/design-system/components/data-table.tsx`, add to the imports:

```tsx
import { columnWidths } from "@domain/table-layout";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef, useState } from "react";
```

(`useState` is already imported — extend the existing `react` import rather than duplicating it.)

Add above the `DataTableProps` interface:

```tsx
/**
 * First guess at a row's height, corrected per row by `measureElement`.
 * Rows are `py-3.5` on touch and `py-2.5` on desktop, and a long surname wraps
 * now that columns are proportional, so heights genuinely vary.
 */
const ROW_ESTIMATE_PX = 48;

/** Rows rendered beyond the viewport, so a fast scroll does not show a gap. */
const OVERSCAN = 8;
```

- [ ] **Step 3: Measure where the table starts**

Inside the `DataTable` function, after the `useReactTable` call, add:

```tsx
  const rows = table.getRowModel().rows;

  // A window virtualizer measures against the DOCUMENT, so it has to be told
  // how far down the page the table begins. Without this it computes its
  // window off by the height of the heading, the search box and the toolbar
  // above it, which presents as a table that stays blank until you have
  // scrolled well past its top.
  const tableRef = useRef<HTMLTableElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const element = tableRef.current;
    if (!element) return;

    const measure = () => {
      setScrollMargin(element.getBoundingClientRect().top + window.scrollY);
    };
    measure();

    // Anything above the table can change height — the class filter appearing,
    // a ClassForm opening — and each of those moves the table's top.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: OVERSCAN,
    scrollMargin,
    // Keyed by the row's own id so a sort or a filter cannot hand a measured
    // height — or any row state — to a different record.
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start - scrollMargin : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  const visibleColumns = table.getVisibleLeafColumns();
  const widths = columnWidths(visibleColumns.map((column) => column.getSize()));
```

Then replace the existing `const rowCount = table.getRowModel().rows.length;` line with:

```tsx
  const rowCount = rows.length;
```

- [ ] **Step 4: Render the fixed layout, the colgroup and the ARIA row count**

Replace the opening `<table ...>` tag and add a `<colgroup>` immediately inside it:

```tsx
        <table
          ref={tableRef}
          className="w-full table-fixed text-base md:text-sm"
          // The DOM holds about twenty rows out of however many there are, so
          // a screen reader would otherwise announce "row 4 of 12" for the
          // two-hundredth pupil. The count is the FILTERED total plus the
          // header, since that is the list the teacher is actually in.
          aria-rowcount={rowCount + 1}
        >
          <colgroup>
            {visibleColumns.map((column, index) => (
              <col key={column.id} style={{ width: widths[index] }} />
            ))}
          </colgroup>
```

- [ ] **Step 5: Give the header row its ARIA index and drop the old width hack**

On the header `<tr>`, add `aria-rowindex={1}`:

```tsx
              <tr key={hg.id} aria-rowindex={1} className="border-b border-border text-left">
```

On the header `<th>`, **delete** the `style` line entirely — width now comes from the `<colgroup>`, and leaving both fights:

```tsx
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
```

- [ ] **Step 6: Replace the tbody with the virtualized one**

Replace the whole `<tbody>` block:

```tsx
          <tbody>
            {/* Spacers rather than `transform: translateY` on each row: a
                positioned <tr> leaves the table's layout, stops participating
                in column sizing, and the header then aligns with nothing. */}
            {paddingTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={visibleColumns.length} style={{ height: paddingTop }} />
              </tr>
            )}

            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <tr
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  aria-rowindex={virtualRow.index + 2}
                  className="border-b border-border/50 transition-colors hover:bg-bg-hover"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className={["px-3 py-3.5 md:py-2.5", cell.column.columnDef.meta?.className]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={visibleColumns.length} style={{ height: paddingBottom }} />
              </tr>
            )}
          </tbody>
```

**`data-index` is required** — `measureElement` reads it to know which row it just measured. Omit it and every row measures onto index 0.

- [ ] **Step 7: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests. No test exercises this file; the gate is proving nothing else broke.

- [ ] **Step 8: Verify in the browser**

```bash
yarn dev
```

Open `http://localhost:3000/classes/<any-class-id>/eleves`. Confirm:
- the roster renders, all rows reachable by scrolling
- columns do **not** change width while scrolling
- the four columns are equal quarters (they are untuned until Task 5 — expected)

- [ ] **Step 9: Commit**

```bash
git add package.json yarn.lock src/modules/design-system/components/data-table.tsx
git commit -m "feat(design-system): DataTable virtualizes every table it draws"
```

---

### Task 3: The header stays

**Files:**
- Modify: `src/modules/design-system/components/data-table.tsx`

**Interfaces:**
- Consumes: the virtualized `DataTable` from Task 2.
- Produces: no API change. A `<thead>` whose cells stick below the floating drawer button.

- [ ] **Step 1: Add the sticky offset constant**

Below `OVERSCAN` in `data-table.tsx`:

```tsx
/**
 * Where the sticky header comes to rest.
 *
 * NOT `top: 0`. The drawer button is `fixed top-0 left-0 z-30`, 44px plus the
 * safe-area inset, sitting exactly where a flush header would land — on a
 * narrow screen it would cover the "Nom" label and its sort control. This is
 * the same expression `AdminLayout` uses for its `main` padding, so no new
 * constant enters the app and the header stays right if `--control-min` ever
 * changes.
 */
const STICKY_TOP = "calc(max(0.5rem, env(safe-area-inset-top)) + var(--control-min) + 0.5rem)";
```

- [ ] **Step 2: Make the header cells sticky**

On the header `<th>`, add `sticky z-10` and an opaque background to the className array, and add the `style`:

```tsx
                  <th
                    key={header.id}
                    className={[
                      "sticky z-10 bg-bg px-3 py-2 font-medium text-text-muted",
                      header.column.columnDef.meta?.className,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ top: STICKY_TOP }}
                    aria-sort={
```

Sticky goes on `<th>` rather than on `<thead>`: `position: sticky` on a `<thead>` is only supported in recent browsers, while sticky table cells have worked for years. The background is required — without it rows scroll visibly through the header.

- [ ] **Step 3: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests.

- [ ] **Step 4: Verify in the browser**

On the roster page with `yarn dev` running:
- scroll down; the header stays visible
- the ☰ button is never covered by the header, and never covers the first column's label
- no row content shows through the header background
- narrow the window to 375px and repeat

- [ ] **Step 5: Commit**

```bash
git add src/modules/design-system/components/data-table.tsx
git commit -m "feat(design-system): the table header stays put"
```

---

### Task 4: `DataTable` gains four optional props

**Files:**
- Modify: `src/modules/design-system/components/data-table.tsx`

**Interfaces:**
- Consumes: the `DataTable` from Tasks 2–3.
- Produces:
  - `toolbar?: ReactNode` — rendered in the search input's flex row
  - `onRowClick?: (row: T) => void` — mouse convenience over the first cell's link
  - `globalFilter?: string` and `onGlobalFilterChange?: (value: string) => void` — optionally controlled; uncontrolled when both are omitted
  - `noResultsMessage?: ReactNode` — replaces the generic "Aucun résultat"

- [ ] **Step 1: Extend the props interface**

Add `import type { ReactNode } from "react";` and extend `DataTableProps<T>`:

```tsx
  /**
   * A page's own filters, rendered beside the search input.
   *
   * The search input belongs to DataTable; a page-specific control like a
   * class picker does not. The slot puts them on one line without DataTable
   * knowing what the control is.
   */
  toolbar?: ReactNode;
  /**
   * Navigation on a row click, as a MOUSE CONVENIENCE ONLY.
   *
   * A <tr> takes no focus and Enter does not fire on it, so this is never the
   * only way to reach a row's destination: the first cell must hold a real
   * <Link>. Events originating inside an <a> or a <button> are ignored, so the
   * link does not fire twice and a row's controls keep working.
   */
  onRowClick?: (row: T) => void;
  /**
   * The search value, when the page owns it — a list page mirrors it into the
   * URL so Back restores what the teacher typed. Omit BOTH this and
   * `onGlobalFilterChange` to let DataTable hold the value itself.
   */
  globalFilter?: string;
  onGlobalFilterChange?: (value: string) => void;
  /** Replaces the generic "Aucun résultat" when a filter empties the list. */
  noResultsMessage?: ReactNode;
```

Add the four to the destructured parameter list.

- [ ] **Step 2: Make the filter optionally controlled**

Replace `const [globalFilter, setGlobalFilter] = useState("");` with:

```tsx
  // Controlled when the caller passes a value, uncontrolled otherwise. This
  // fails visibly rather than silently: pass the value without the handler and
  // the input freezes on the first keystroke, which is noticed immediately.
  const [uncontrolledFilter, setUncontrolledFilter] = useState("");
  const isFilterControlled = globalFilter !== undefined;
  const filterValue = isFilterControlled ? globalFilter : uncontrolledFilter;

  const setFilterValue = (value: string) => {
    if (!isFilterControlled) setUncontrolledFilter(value);
    onGlobalFilterChange?.(value);
  };
```

In the `useReactTable` call, replace `state: { sorting, globalFilter },` with `state: { sorting, globalFilter: filterValue },` and replace `onGlobalFilterChange: setGlobalFilter,` with:

```tsx
    onGlobalFilterChange: (updater) => {
      setFilterValue(typeof updater === "function" ? updater(filterValue) : (updater as string));
    },
```

- [ ] **Step 3: Render the toolbar row**

Replace the existing search `<input>` block with:

```tsx
      {(globalSearchFields || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {globalSearchFields && (
            <input
              type="search"
              placeholder={searchPlaceholder ?? t("common.search")}
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              aria-label={searchPlaceholder ?? t("common.search")}
              className="field max-w-sm flex-1"
            />
          )}
          {toolbar}
        </div>
      )}
```

- [ ] **Step 4: Use the no-results message**

Replace the two empty-state lines:

```tsx
      {data.length === 0 && !filterValue ? (
        <p className="text-text-muted">{emptyMessage ?? t("common.noData")}</p>
      ) : rowCount === 0 ? (
        <p className="text-text-muted">{noResultsMessage ?? t("common.noResults")}</p>
      ) : (
```

- [ ] **Step 5: Wire the row click**

Add above the `return`:

```tsx
  // A click that started on a link, a button or a form control belongs to that
  // control. Without this the first cell's <Link> and the row would both fire,
  // and a row carrying a delete button could not be used at all.
  const rowClickHandler = (row: T) => (event: React.MouseEvent<HTMLTableRowElement>) => {
    if (!onRowClick) return;
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
    onRowClick(row);
  };
```

On the data `<tr>`, add the handler and the pointer affordance:

```tsx
                  onClick={rowClickHandler(row.original)}
                  className={[
                    "border-b border-border/50 transition-colors hover:bg-bg-hover",
                    onRowClick ? "cursor-pointer" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
```

- [ ] **Step 6: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests. The class roster passes none of the new props, so its behaviour is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/modules/design-system/components/data-table.tsx
git commit -m "feat(design-system): toolbar, row click, controlled filter, empty copy"
```

---

### Task 5: Tune the class roster's column widths

The one existing consumer, which has shared the width equally since Task 2. It gets widths and **nothing else** — no `onRowClick`; its surname cell goes on opening the `StudentCard`.

**Files:**
- Modify: `src/modules/class/students-page.tsx`

**Interfaces:**
- Consumes: `DataTable` from Tasks 2–4.
- Produces: nothing other tasks use.

- [ ] **Step 1: Give each column a ratio**

In the `columns` `useMemo`, add `size` to each of the four definitions. `size` is a ratio, not pixels:

```tsx
      helper.accessor("lastName", {
        header: () => t("student.lastName"),
        size: 26,
```

```tsx
      helper.accessor("firstName", { header: () => t("student.firstName"), size: 20 }),
```

```tsx
      helper.display({
        id: "groups",
        header: () => t("group.title"),
        size: 28,
```

```tsx
      helper.display({
        id: "actions",
        header: () => "",
        size: 26,
```

- [ ] **Step 2: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests.

- [ ] **Step 3: Verify in the browser**

On `/classes/<id>/eleves`:
- the two action buttons fit on one line at desktop width
- group chips wrap inside their column rather than pushing it wider
- at 375px there is **no horizontal scrollbar**
- clicking the surname still opens the pupil card; clicking elsewhere in the row does nothing

- [ ] **Step 4: Commit**

```bash
git add src/modules/class/students-page.tsx
git commit -m "feat(class): declare column ratios on the roster"
```

---

### Task 6: Search params on both list routes

**Files:**
- Modify: `src/router.ts`
- Modify: `src/app.tsx`
- Modify: `src/modules/classes/page.tsx`
- Modify: `src/modules/students/page.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `ClassesPage` receives `q?: string`; `StudentsPage` receives `q?: string` and `classe?: string`. Both pages must accept these props before this task's gate passes — add the props in this task as unused parameters, and Tasks 7 and 8 give them behaviour.

- [ ] **Step 1: Declare the params**

In `src/router.ts`, replace the two route lines:

```ts
    // A list page's filter lives in its URL: row-click navigation makes "go
    // in, come back" the primary loop, and a teacher who typed six characters
    // to find a pupil should not retype them after looking at that pupil.
    // Written with `replace`, never `push` — a push per keystroke makes Back
    // walk "bernard" one character at a time.
    Classes: "/classes?:q",
    Students: "/students?:q&:classe",
```

- [ ] **Step 2: Pass them through**

In `src/app.tsx`, replace the two cases:

```tsx
    case "Classes":
      return <ClassesPage q={route.params.q} />;
    case "Students":
      return <StudentsPage q={route.params.q} classe={route.params.classe} />;
```

- [ ] **Step 3: Accept them at both pages**

In `src/modules/classes/page.tsx`, change the signature:

```tsx
export function ClassesPage({ q }: { q?: string }) {
```

In `src/modules/students/page.tsx`:

```tsx
export function StudentsPage({ q, classe }: { q?: string; classe?: string }) {
```

Both are unused for now. If `yarn lint` flags an unused binding, prefix with an underscore here and rename in the task that uses them.

- [ ] **Step 4: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests.

- [ ] **Step 5: Verify in the browser**

Visit `/students?q=test&classe=abc`. The page renders as before and the URL survives; nothing reads the params yet.

- [ ] **Step 6: Commit**

```bash
git add src/router.ts src/app.tsx src/modules/classes/page.tsx src/modules/students/page.tsx
git commit -m "feat(router): a list page's filter lives in its URL"
```

---

### Task 7: `/classes` becomes a table

**Files:**
- Modify: `src/modules/classes/page.tsx`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `DataTable` (Tasks 2–4), `q` prop (Task 6).
- Produces: `ClassRow = SchoolClass & { headcount: number }` — local to this file, nothing else imports it.

- [ ] **Step 1: Add the i18n keys**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
python3 - <<'PY'
import json, collections
for locale, values in {
    "fr": {"searchPlaceholder": "Filtrer par nom", "columnName": "Nom", "columnHeadcount": "Élèves"},
    "en": {"searchPlaceholder": "Filter by name", "columnName": "Name", "columnHeadcount": "Pupils"},
}.items():
    path = f"src/i18n/locales/{locale}.json"
    data = json.load(open(path), object_pairs_hook=collections.OrderedDict)
    data.setdefault("classes", collections.OrderedDict()).update(values)
    json.dump(data, open(path, "w"), ensure_ascii=False, indent=2)
    open(path, "a").write("\n")
print("ok")
PY
```

- [ ] **Step 2: Rewrite the page**

Replace the whole of `src/modules/classes/page.tsx`:

```tsx
import type { SchoolClass } from "@db";
import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
// Crosses a module boundary: creating a class belongs to the class module,
// and both this screen and that one create classes. CLAUDE.md records the
// exception rather than pretending the boundary is clean.
import { ClassForm } from "../class/components/class-form";
import { DataTable } from "../design-system/components/data-table";

/** The headcount is a real column so that it sorts as a number. */
type ClassRow = SchoolClass & { headcount: number };

const helper = createColumnHelper<ClassRow>();

export function ClassesPage({ q }: { q?: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [addingClass, setAddingClass] = useState(false);

  const data = useLiveQuery(async () => {
    const [classes, students] = await Promise.all([db.classes.toArray(), db.students.toArray()]);
    return { classes, students };
  }, [db]);

  const rows = useMemo<ClassRow[]>(() => {
    if (!data) return [];
    const headcounts = new Map<string, number>();
    for (const student of data.students) {
      headcounts.set(student.classId, (headcounts.get(student.classId) ?? 0) + 1);
    }
    return data.classes.map((schoolClass) => ({
      ...schoolClass,
      headcount: headcounts.get(schoolClass.id) ?? 0,
    }));
  }, [data]);

  const columns = useMemo(
    () => [
      helper.accessor("name", {
        header: () => t("classes.columnName"),
        size: 60,
        // The row's <tr> also navigates, but this link is what makes the
        // destination reachable: a <tr> takes no focus and Enter does not fire
        // on it, and only an anchor gives a hover URL and a ⌘-click.
        cell: (info) => (
          <Link
            to={Router.Class({ classId: info.row.original.id })}
            className="font-medium hover:underline"
          >
            {info.getValue()}
          </Link>
        ),
      }),
      helper.accessor("headcount", {
        header: () => t("classes.columnHeadcount"),
        size: 40,
        cell: (info) => (
          <span className="text-text-muted">
            {t("dashboard.studentCount", { count: info.getValue() })}
          </span>
        ),
      }),
    ],
    [t],
  );

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-lg">{t("dashboard.classes")}</h2>
        <button type="button" className="btn btn-primary" onClick={() => setAddingClass(true)}>
          {t("dashboard.addClass")}
        </button>
      </div>

      {addingClass && <ClassForm key="new" onDone={() => setAddingClass(false)} />}

      <DataTable
        columns={columns as ColumnDef<ClassRow, unknown>[]}
        data={rows}
        getRowId={(schoolClass) => schoolClass.id}
        globalSearchFields={["name"]}
        searchPlaceholder={t("classes.searchPlaceholder")}
        globalFilter={q ?? ""}
        // `replace`, never `push`: a push per keystroke makes Back walk the
        // typed name one character at a time. An empty value drops the param
        // rather than leaving `?q=` on the URL.
        onGlobalFilterChange={(value) => Router.replace("Classes", { q: value || undefined })}
        onRowClick={(schoolClass) => Router.push("Class", { classId: schoolClass.id })}
        emptyMessage={t("dashboard.noClasses")}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests. The i18n parity test proves both locales gained the same keys.

- [ ] **Step 4: Verify in the browser**

On `/classes`:
- sixteen classes render as a table, sorted alphabetically (3°A first — expected; see the spec)
- clicking a column header sorts, and the headcount sorts numerically rather than as text
- typing in the filter narrows the list and writes `?q=` on the URL
- the browser's history holds ONE entry after typing several characters — press Back once and it leaves the page
- clicking a row opens that class; clicking the name link does the same, once
- Tab reaches the name link and Enter follows it

- [ ] **Step 5: Commit**

```bash
git add src/modules/classes/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(classes): the class list is a table"
```

---

### Task 8: `/students` becomes a table with a class filter

**Files:**
- Modify: `src/modules/students/page.tsx`
- Modify: `src/i18n/locales/fr.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `DataTable` (Tasks 2–4), `q` and `classe` props (Task 6).
- Produces: `StudentRow = Student & { classLabel: string }` — local to this file.

- [ ] **Step 1: Add the i18n keys**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
python3 - <<'PY'
import json, collections
for locale, values in {
    "fr": {"columnClass": "Classe", "allClasses": "Toutes les classes", "classFilterLabel": "Filtrer par classe"},
    "en": {"columnClass": "Class", "allClasses": "All classes", "classFilterLabel": "Filter by class"},
}.items():
    path = f"src/i18n/locales/{locale}.json"
    data = json.load(open(path), object_pairs_hook=collections.OrderedDict)
    data.setdefault("students", collections.OrderedDict()).update(values)
    json.dump(data, open(path, "w"), ensure_ascii=False, indent=2)
    open(path, "a").write("\n")
print("ok")
PY
```

- [ ] **Step 2: Rewrite the page**

Replace the whole of `src/modules/students/page.tsx`:

```tsx
import type { Student } from "@db";
import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { DataTable } from "../design-system/components/data-table";
import { PupilName } from "../design-system/components/pupil-name";

/**
 * The class name is carried ON the row rather than looked up in a cell, so
 * that Classe sorts and so that the accent-insensitive search still reaches
 * it — "eloise" finds Éloïse, "3°B" finds everyone in 3°B.
 *
 * `classLabel` and not `className`: a data field called `className` inside a
 * React component is a reader's trap, and this codebase has renamed for less
 * (`SchoolClass` over `class`, `Desk` over `Table`).
 */
type StudentRow = Student & { classLabel: string };

const helper = createColumnHelper<StudentRow>();

/**
 * Every pupil in the workspace, searchable and filterable by class.
 *
 * Its own destination because looking a child up — before a parents' evening,
 * or when a colleague asks — used to mean remembering which class they are in
 * and drilling through it. Both filters live in the URL so that going into a
 * pupil and coming back does not throw away what the teacher typed.
 */
export function StudentsPage({ q, classe }: { q?: string; classe?: string }) {
  const { t } = useTranslation();
  const db = useDb();

  const data = useLiveQuery(async () => {
    const [students, classes] = await Promise.all([
      db.students.orderBy("lastName").toArray(),
      db.classes.toArray(),
    ]);
    return { students, classes };
  }, [db]);

  const rows = useMemo<StudentRow[]>(() => {
    if (!data) return [];
    const names = new Map(data.classes.map((c) => [c.id, c.name]));
    return data.students.map((student) => ({
      ...student,
      classLabel: names.get(student.classId) ?? "",
    }));
  }, [data]);

  const columns = useMemo(
    () => [
      helper.accessor("lastName", {
        header: () => t("student.lastName"),
        size: 40,
        // Through PupilName like every other surname in the app. The accessor
        // still returns the raw stored value, so sorting and the search read
        // what the teacher typed rather than the capitals CSS renders.
        cell: (info) => (
          <Link
            to={Router.Student({ studentId: info.row.original.id })}
            className="font-medium hover:underline"
          >
            <PupilName student={info.row.original} format="surname" />
          </Link>
        ),
      }),
      helper.accessor("firstName", { header: () => t("student.firstName"), size: 35 }),
      helper.accessor("classLabel", {
        header: () => t("students.columnClass"),
        size: 25,
        cell: (info) => <span className="text-text-muted">{info.getValue()}</span>,
      }),
    ],
    [t],
  );

  if (!data) return <p className="text-text-muted">{t("common.loading")}</p>;

  // Held as a class ID, never an index, and a class that no longer exists
  // reads as "Toutes" rather than as an empty list — the same rule
  // `resolveGroupSelection` applies to the group filter.
  const selectedClassId = classe && data.classes.some((c) => c.id === classe) ? classe : null;

  const visibleRows = selectedClassId
    ? rows.filter((row) => row.classId === selectedClassId)
    : rows;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-semibold text-lg">{t("nav.students")}</h2>

      <DataTable
        columns={columns as ColumnDef<StudentRow, unknown>[]}
        data={visibleRows}
        getRowId={(student) => student.id}
        globalSearchFields={["lastName", "firstName", "classLabel"]}
        searchPlaceholder={t("students.searchPlaceholder")}
        globalFilter={q ?? ""}
        onGlobalFilterChange={(value) =>
          Router.replace("Students", {
            q: value || undefined,
            classe: selectedClassId ?? undefined,
          })
        }
        onRowClick={(student) => Router.push("Student", { studentId: student.id })}
        emptyMessage={t("students.none")}
        // Keeps today's echo of the query. It is how a teacher notices they
        // typed "brenard" rather than "bernard"; the generic "Aucun résultat"
        // would not. The class filter needs no mention — the select visibly
        // shows what it is set to.
        noResultsMessage={t("students.noMatch", { query: q ?? "" })}
        toolbar={
          // A control with one option does nothing.
          data.classes.length > 1 ? (
            <select
              className="field"
              aria-label={t("students.classFilterLabel")}
              value={selectedClassId ?? ""}
              onChange={(e) =>
                Router.replace("Students", {
                  q: q || undefined,
                  classe: e.target.value || undefined,
                })
              }
            >
              <option value="">{t("students.allClasses")}</option>
              {data.classes.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
    </div>
  );
}
```

- [ ] **Step 3: Run the gate**

```bash
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests.

- [ ] **Step 4: Verify in the browser**

On `/students` with the 360-pupil seed:
- all 360 pupils reachable by scrolling, no blank band, no column jitter
- the class select narrows to one class and writes `?classe=<id>`
- search and class filter compose; both survive in the URL
- « Aucun élève ne correspond à "zzz" » shows the typed query
- clicking a row opens that pupil; Back returns with both filters intact
- Tab reaches the surname link and Enter follows it
- at 375px no horizontal scrollbar
- hand-edit the URL to `?classe=not-a-real-id` — the select reads "Toutes les classes" and every pupil is listed

- [ ] **Step 5: Commit**

```bash
git add src/modules/students/page.tsx src/i18n/locales/fr.json src/i18n/locales/en.json
git commit -m "feat(students): the pupil list is a table, filterable by class"
```

---

### Task 9: Record the conventions and verify the whole thing

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Run the full gate one last time**

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH"
yarn format && yarn lint && yarn typecheck && yarn test
```

Expected: all green, 617 tests, 48 suites.

- [ ] **Step 2: Capture the scroll as a GIF**

With `yarn dev` running, drive a browser to `/students` and record scrolling the full 360 rows. The claim being evidenced is "no blank band, no column jitter", which is better shown than asserted. Send the GIF to the author.

- [ ] **Step 3: Add the section to CLAUDE.md**

Insert after the "### Navigation" section:

```markdown
### The list pages are tables, and DataTable virtualizes

`/classes` and `/students` are `DataTable`, not card grids: a music teacher's
collège is sixteen classes and 360 pupils, and 360 cards is a wall.

**`DataTable` virtualizes every table it draws** — always, with no prop and no
threshold. An opt-in flag was rejected because it would silently make `size`
mandatory, and the next person to flip it would get jittering columns with
nothing to name the cause. The cost is paid where it buys nothing: a gradebook
grid is one class, so ~23 rows, and `/students` is the only surface that has
ever held 360.

**Every column declares `size`, read as a unitless RATIO** and normalised to
percentages by `columnWidths` (`src/domain/table-layout.ts`). Automatic layout
sizes a column from the rows it can see, and a virtualized table only ever sees
twenty — so columns would resize as you scroll. Percentages rather than pixels
because the app runs on a phone: pixel widths guarantee a horizontal scrollbar
under a thumb already scrolling vertically.

It is `useWindowVirtualizer`, not the scrollbox kind — nothing in this app has
ever scrolled inside a fixed-height panel. **`scrollMargin` is load-bearing**:
a window virtualizer measures against the document, so it must be told how far
down the page the table starts, or it renders blank until you scroll past it.
Rows are spaced by empty `<tr>` above and below rather than by
`transform: translateY`, which would take each row out of table layout and
leave the header aligned to nothing. `data-index` on each `<tr>` is required —
`measureElement` reads it, and without it every row measures onto index 0.

**A `<tr>` is never the only way to reach a row's destination.** It takes no
focus and Enter does not fire on it, so the first cell holds a real `<Link>`
and `onRowClick` is a mouse convenience layered on top, ignoring events that
start inside an `<a>` or a `<button>`.

**A list page's filter lives in its URL**, written with `Router.replace` and
never `push` — a push per keystroke makes Back walk a typed name one character
at a time. `?classe` carries a class **id**, since `classes: "id, name"` leaves
the name non-unique. Scroll position is deliberately not restored; the filters
coming back is the part that costs retyping.

Two costs are accepted and permanent: **⌘F cannot find a row outside the
rendered window** (which is why the search box stays directly above the table),
and `aria-rowcount` / `aria-rowindex` are hand-maintained, counting the
FILTERED rows plus the header.

The class roster (`/classes/:classId/eleves`) has column widths and no
`onRowClick`: its surname cell opens the `StudentCard`, and a tap on a pupil
opening their card is the gesture of the lesson.
```

- [ ] **Step 4: Update the Known gaps section**

Add one bullet to "## Known gaps":

```markdown
- `/students` renders every pupil in one virtualized list with no pagination.
  Whether 360 rows needed virtualizing was never measured — the infrastructure
  was chosen over the measurement, and
  `docs/superpowers/specs/2026-09-08-profs-virtualized-tables-design.md` is
  where to start unwinding it if the small tables prove to cost more than the
  big one saves.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the table conventions"
```

---

## Self-Review

**Spec coverage.** Every ruling maps to a task: virtualization unconditional (2), window not scrollbox (2), spacers not transforms (2), ratios not widths (1, 2, 5), row is not the link (4, 7, 8), filter in the URL (6, 7, 8), header stays (3), accessibility (2), the `DataTable` API table (4), the two pages (7, 8), the roster (5), the dependency (2), testing (1, 9), costs recorded (9).

**Placeholders.** None. Every code step carries the code; every command carries its expected result.

**Type consistency.** `columnWidths(sizes: number[]): string[]` is defined in Task 1 and consumed in Task 2 under that exact name. `ClassRow` (Task 7) and `StudentRow` (Task 8) are each local to their file. The four new props are named identically in Task 4's interface block and at both call sites. `classLabel` is used consistently in the row type, the accessor, and `globalSearchFields`.

**One trap flagged for the executor.** Task 6 leaves `q` and `classe` unused at both pages. That is deliberate, so the router change lands and passes the gate on its own; Tasks 7 and 8 give them behaviour.
