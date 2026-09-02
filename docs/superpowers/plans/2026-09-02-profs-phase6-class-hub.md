# Phase 6 — the class is the page: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a class one page with four tabs — Plan de table, Élèves, Carnets, Journal — and remove the flat `/gradebooks` destination.

**Architecture:** `ClassPage` becomes a shell that owns the class header, the tab bar, the group filter and the selected session, and renders one of four tab components beneath it. Chicane has no nested outlet, so the "outlet" is the existing `switch` in `app.tsx`, one level deeper. The grid stays a full-screen route outside the tabs. No schema change.

**Tech Stack:** React 19, Chicane (routing), Dexie + `useLiveQuery`, TanStack Table, i18next, rspack, Biome, Jest + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-02-profs-phase6-class-hub.md`

## Global Constraints

- **No network request of any kind.** No `fetch`, no CDN font, no external image. This is a written promise in `README.md` and `PRIVACY.md`.
- **No `window.confirm`, `alert`, or any blocking browser dialog.** They freeze the browser automation these pages are verified with. Destructive actions use `ConfirmButton` (two-step, in place).
- **Every user-visible string goes through `t()`**, and every key exists in BOTH `src/i18n/locales/fr.json` and `en.json`. A parity test fails the build otherwise.
- **`fr` is the default and the fallback**, `en` alongside. Identifiers are English; only translation values are French.
- **Writes live in `src/db/`, never in a component.**
- **State bound to a record is anchored to that record's identity, never its position.** Group filter holds a group id; the session holds a session id; `ConfirmButton`s inside lists are keyed by record id.
- **`useLiveQuery` dependency arrays always include `db`.** Omitting it leaves the previous établissement's pupils on screen after a workspace switch.
- **44px minimum tap targets** on live-entry surfaces (`var(--control-min)`).
- **Navigation uses Chicane `<Link to={Router.X({...})}>`.** A raw `<a href>` causes a full page reload.
- **Validation gate, all four green before any task is done:** `yarn format && yarn lint && yarn typecheck && yarn test`.

---

### Task 1: Routes and the tab shell

**Files:**
- Modify: `src/router.ts`
- Modify: `src/app.tsx`
- Modify: `src/modules/class/page.tsx` (becomes the shell)
- Create: `src/modules/class/tabs/students.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `ClassLayout` renders `{ classId, tab }` and passes to every tab component the props `{ classId, students, groups, memberships, selectedGroupId, onSelectGroup, selectedSessionId, onSelectSession }`. Tab components are named `ClassStudentsTab`, `ClassPlanTab`, `ClassBooksTab`, `ClassDiaryTab` and each takes `ClassTabProps` (exported from `src/modules/class/tabs/types.ts`).

- [ ] **Step 1: Add the routes**

In `src/router.ts`, inside `createRouter({...})`, replace the `Class` and `Plan` entries with:

```ts
    Class: "/classes/:classId",
    ClassPlan: "/classes/:classId/plan",
    ClassStudents: "/classes/:classId/students",
    ClassBooks: "/classes/:classId/books",
    ClassDiary: "/classes/:classId/diary",
```

Remove the `Gradebooks: "/gradebooks"` entry. Leave every `/gradebooks/:gradebookId…` route untouched.

- [ ] **Step 2: Define the tab prop type**

Create `src/modules/class/tabs/types.ts`:

```ts
import type { GroupMember, Student, StudentGroup } from "@db";

/**
 * What every tab of the class hub receives.
 *
 * The class row, its pupils and its groups are loaded ONCE by the shell:
 * a tab that re-queried them would flash "Chargement…" over a class whose
 * name is already on screen every time the teacher changes tab.
 *
 * The group filter and the selected session live in the shell for the same
 * reason they are shared at all — filtering the roster to "Groupe A" and
 * finding the seating plan unfiltered reads as a bug.
 */
export interface ClassTabProps {
  classId: string;
  students: Student[];
  groups: StudentGroup[];
  memberships: GroupMember[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}
```

- [ ] **Step 3: Turn `class/page.tsx` into the shell**

`ClassPage` keeps its existing queries for the class row, students, groups and memberships, and its rename/delete header. It loses the roster table, the student form, the CSV import and the group section — those move to `tabs/students.tsx` in Step 4.

Its signature becomes:

```tsx
export function ClassPage({ classId, tab }: { classId: string; tab: ClassTab }) {
```

with, above it:

```ts
export const CLASS_TABS = ["plan", "students", "books", "diary"] as const;
export type ClassTab = (typeof CLASS_TABS)[number];
```

The tab bar renders one `<Link>` per tab (never a `<button>` — these are navigations):

```tsx
<nav className="flex gap-1 border-border border-b" aria-label={t("class.tabs")}>
  {CLASS_TABS.map((name) => (
    <Link
      key={name}
      to={tabHref(name, classId)}
      className="rounded-t px-3 py-2 font-medium text-sm text-text-muted hover:bg-bg-hover hover:text-text"
      activeClassName="bg-bg-hover text-text"
      aria-current={name === tab ? "page" : undefined}
    >
      {t(`class.tab.${name}`)}
    </Link>
  ))}
</nav>
```

with

```ts
function tabHref(tab: ClassTab, classId: string): string {
  switch (tab) {
    case "plan":
      return Router.ClassPlan({ classId });
    case "students":
      return Router.ClassStudents({ classId });
    case "books":
      return Router.ClassBooks({ classId });
    case "diary":
      return Router.ClassDiary({ classId });
  }
}
```

The shell holds the two shared selections:

```tsx
  // Held as a group id, never an index: a deleted group falls back to "Tous".
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Held as a session id, never a position. The Plan tab keeps it in step
  // with today's session; the roster only reads it, to decide whether the
  // pupil card may record attendance.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
```

Keep the existing loading and not-found discipline exactly as it is — `useLiveQuery` returns `undefined` for both "loading" and "no such class", so the `?? null` on the class query stays, and a deleted class renders `class.notFound` rather than sitting on "Chargement…".

The class delete keeps pushing `Home` after `deleteClass`.

- [ ] **Step 4: Move the roster into its tab**

Create `src/modules/class/tabs/students.tsx` exporting `ClassStudentsTab({ ... }: ClassTabProps)`. Move into it, unchanged in behaviour: the `helper`/`columns` memo, the `DataTable` (keeping `getRowId={(student) => student.id}` — the actions cell holds an armed delete and an index key would hand it to a different pupil), `StudentForm`, `CsvImport`, the group section with `GroupForm`, and the "Ajouter un élève" / "Importer un CSV" buttons.

The ceiling props phase 5 added stay as they are: `studentCount={students.length}` on both `StudentForm` and `CsvImport`.

The tab's `GroupFilter` now reads `selectedGroupId` and calls `onSelectGroup` from props instead of local state. After `deleteGroup`, keep the existing reset:

```tsx
onConfirm={async () => {
  await deleteGroup(db, group.id);
  if (selectedGroupId === group.id) onSelectGroup(null);
}}
```

- [ ] **Step 5: Wire the routes in `app.tsx`**

Add `"ClassPlan" | "ClassStudents" | "ClassBooks" | "ClassDiary"` to the `Router.useRoute([...])` list and to the `AppRoute` union, and remove `"Gradebooks"` and `"Plan"` from both. In `Routes`:

```tsx
    case "Class":
      // A class opens on its seating plan: that is the mid-lesson view.
      Router.replace("ClassPlan", { classId: route.params.classId });
      return null;
    case "ClassPlan":
      return <ClassPage classId={route.params.classId} tab="plan" />;
    case "ClassStudents":
      return <ClassPage classId={route.params.classId} tab="students" />;
    case "ClassBooks":
      return <ClassPage classId={route.params.classId} tab="books" />;
    case "ClassDiary":
      return <ClassPage classId={route.params.classId} tab="diary" />;
```

Until Tasks 2–4 land, have the shell render the students tab for every value of `tab` other than `students` with a `TODO`-free placeholder: render `<ClassStudentsTab {...props} />` for `students` and `null` for the rest. The tab bar is already navigable, so the intermediate state is coherent rather than broken.

- [ ] **Step 6: Add the tab labels to both locales**

`fr.json`, inside `class`:

```json
    "tabs": "Sections de la classe",
    "tab": {
      "plan": "Plan de table",
      "students": "Élèves",
      "books": "Carnets",
      "diary": "Journal"
    },
```

`en.json`, inside `class`:

```json
    "tabs": "Class sections",
    "tab": {
      "plan": "Seating plan",
      "students": "Pupils",
      "books": "Gradebooks",
      "diary": "Journal"
    },
```

- [ ] **Step 7: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: all green, 400+ tests passing (the i18n parity test covers Step 6).

- [ ] **Step 8: Commit**

```bash
git add src/router.ts src/app.tsx src/modules/class src/i18n/locales
git commit -m "feat(class): a class is a page with tabs, opening on its plan"
```

---

### Task 2: The Plan tab

**Files:**
- Create: `src/modules/class/tabs/plan.tsx`
- Modify: `src/modules/plan/page.tsx`
- Modify: `src/modules/class/page.tsx`

**Interfaces:**
- Consumes: `ClassTabProps` from Task 1.
- Produces: `PlanPage` takes `{ classId, groups, selectedGroupId, onSelectGroup, selectedSessionId, onSelectSession }` instead of owning group and session state.

- [ ] **Step 1: Lift the plan page's shared state to props**

In `src/modules/plan/page.tsx`, delete these two `useState` declarations:

```tsx
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
```

and change the signature to:

```tsx
export function PlanPage({
  classId,
  groups,
  selectedGroupId,
  onSelectGroup,
  selectedSessionId,
  onSelectSession,
}: {
  classId: string;
  groups: StudentGroup[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
})
```

Everything else stays: `held`, `dropping`, `resizing`, `selectedStudentId`, `manualSelection`, the focus listener, `onDrop`, `useEscape(releaseHeld)`.

`selectSession` becomes:

```tsx
  const selectSession = useCallback(
    (sessionId: string, manual: boolean): void => {
      onSelectSession(sessionId);
      setManualSelection(manual);
    },
    [onSelectSession],
  );
```

`manualSelection` stays local: it describes this view's gesture, not a selection another tab needs.

Delete the page's own `groups` query — the shell supplies them — and pass `onSelectGroup` to `GroupFilter`.

- [ ] **Step 2: Add the tab wrapper**

Create `src/modules/class/tabs/plan.tsx`:

```tsx
import { PlanPage } from "../../plan/page";
import type { ClassTabProps } from "./types";

/**
 * The seating plan, inside the class hub.
 *
 * A wrapper rather than a move: the plan module owns a live gesture (a pupil
 * held in the hand, a layout being resized) and keeping it in its own module
 * keeps that gesture's code together.
 */
export function ClassPlanTab({
  classId,
  groups,
  selectedGroupId,
  onSelectGroup,
  selectedSessionId,
  onSelectSession,
}: ClassTabProps) {
  return (
    <PlanPage
      classId={classId}
      groups={groups}
      selectedGroupId={selectedGroupId}
      onSelectGroup={onSelectGroup}
      selectedSessionId={selectedSessionId}
      onSelectSession={onSelectSession}
    />
  );
}
```

Render it from the shell for `tab === "plan"`.

- [ ] **Step 3: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: green.

- [ ] **Step 4: Verify in the browser**

Run `yarn dev`, open a class. Expected: it lands on Plan de table, the room draws, holding a pupil from the rail and tapping a seat places them, the session bar works, and switching to Élèves and back keeps the group filter.

- [ ] **Step 5: Commit**

```bash
git add src/modules/plan/page.tsx src/modules/class
git commit -m "feat(class): the seating plan becomes the class's first tab"
```

---

### Task 3: The pupil card opens from the roster

**Files:**
- Modify: `src/modules/plan/components/student-card.tsx`
- Modify: `src/modules/class/tabs/students.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `ClassTabProps`, `StudentCard`.
- Produces: `StudentCard` takes `session?: Session | null` and `onMove?: () => void`.

- [ ] **Step 1: Make the session optional on the card**

In `student-card.tsx`, change the props to:

```tsx
export function StudentCard({
  student,
  session,
  onClose,
  onMove,
}: {
  student: Student;
  /** The lesson being recorded, when there is one. Attendance and behaviour
   * belong to a session — a pupil opened from the roster with no session
   * selected gets their notes and a link to their page, and no way to record
   * an absence against nothing. */
  session?: Session | null;
  onClose: () => void;
  /** Only the seating plan can pick a pupil back up. */
  onMove?: () => void;
}) {
```

Guard the two session-scoped live queries so they never run without one:

```tsx
  const attendance = useLiveQuery(
    async () =>
      session ? ((await db.attendance.get(attendanceKey(session.id, student.id))) ?? null) : null,
    [db, session?.id, student.id],
  );
  const events = useLiveQuery(
    () =>
      session
        ? db.behaviourEvents
            .where({ sessionId: session.id, studentId: student.id })
            .reverse()
            .sortBy("createdAt")
        : [],
    [db, session?.id, student.id],
  );
```

Wrap the attendance row, the behaviour buttons and the event list in `{session && ( … )}`, and render `onMove` only when it is given. Everything outside a session — the name, the photo, the notes textarea, the link to the full page — is unchanged.

- [ ] **Step 2: Open the card from a roster row**

In `tabs/students.tsx`, add local state:

```tsx
  // The pupil whose card is open, held as an id: the roster sorts and
  // searches under the card, and an index would open a different pupil.
  const [cardStudentId, setCardStudentId] = useState<string | null>(null);
```

Make the surname cell a button that opens the card rather than plain text, and render below the table:

```tsx
      {cardStudentId !== null &&
        (() => {
          const student = students.find((s) => s.id === cardStudentId);
          if (!student) return null;
          return (
            <StudentCard
              key={student.id}
              student={student}
              session={session ?? null}
              onClose={() => setCardStudentId(null)}
            />
          );
        })()}
```

where `session` is resolved from `selectedSessionId`:

```tsx
  const session = useLiveQuery(
    async () => (selectedSessionId ? ((await db.sessions.get(selectedSessionId)) ?? null) : null),
    [db, selectedSessionId],
  );
```

- [ ] **Step 3: Add the roster's card-open label to both locales**

`fr.json` inside `class`: `"openCard": "Ouvrir la fiche"`.
`en.json` inside `class`: `"openCard": "Open the pupil card"`.

Use it as the button's `aria-label`; the visible text stays the `PupilName`.

- [ ] **Step 4: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: green.

- [ ] **Step 5: Verify in the browser**

Open a class → Élèves → tap a pupil. Expected: the card opens with notes and the link to the full page, and **without** attendance controls when no session has been selected. Then go to Plan de table, let today's session resolve, come back to Élèves, open the same pupil: the attendance controls are now there and toggling one writes.

- [ ] **Step 6: Commit**

```bash
git add src/modules/plan/components/student-card.tsx src/modules/class src/i18n/locales
git commit -m "feat(class): the pupil card opens from the roster, session or not"
```

---

### Task 4: The Carnets tab, and `/gradebooks` goes

**Files:**
- Create: `src/modules/class/tabs/books.tsx`
- Move: `src/modules/gradebooks/components/gradebook-form.tsx` → `src/modules/class/components/gradebook-form.tsx`
- Delete: `src/modules/gradebooks/page.tsx` (and the now-empty module directory)
- Modify: `src/modules/gradebook/page.tsx`
- Modify: `src/modules/shared/components/app-drawer.tsx`
- Modify: `src/i18n/locales/fr.json`, `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `ClassTabProps`.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Move the gradebook form**

`git mv src/modules/gradebooks/components/gradebook-form.tsx src/modules/class/components/gradebook-form.tsx` and fix its relative imports. Give it a required `classId` and drop the class picker: inside a class page the class is not a choice. Only the subject remains selectable.

- [ ] **Step 2: Write the tab**

Create `src/modules/class/tabs/books.tsx` exporting `ClassBooksTab({ classId }: ClassTabProps)`. It queries this class's gradebooks and every subject:

```tsx
  const data = useLiveQuery(async () => {
    const [gradebooks, subjects] = await Promise.all([
      db.gradebooks.where("classId").equals(classId).toArray(),
      db.subjects.toArray(),
    ]);
    return { gradebooks, subjects };
  }, [db, classId]);
```

Each row is a `<Link to={Router.Gradebook({ gradebookId })}>` carrying the gradebook's name and its subject's colour, exactly as the old flat list rendered it. Add a "Nouveau carnet" button that opens the form, disabled with an explanatory line when no subject exists yet (`settings.noSubjects` already says a gradebook joins a class to a subject).

- [ ] **Step 3: Send the grid's delete back to the class**

In `src/modules/gradebook/page.tsx`, the `deleteGradebook` confirm currently ends with `Router.push("Home")`. The teacher arrived from the class's Carnets tab, so send them back there:

```tsx
              await deleteGradebook(db, gradebookId);
              Router.push("ClassBooks", { classId: data.gradebook.classId });
```

Read `classId` from the loaded gradebook **before** the delete, so it is not read off a row that no longer exists.

- [ ] **Step 4: Remove the destination**

Delete `src/modules/gradebooks/` and its import and `case "Gradebooks"` in `app.tsx`. In `app-drawer.tsx`, remove the `gradebooks` destination from the `destinations` array. Leave the `nav.gradebooks` translation key in place only if something still uses it — otherwise delete it from both locales (the parity test does not mind a key being absent from both).

- [ ] **Step 5: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: green. If `yarn typecheck` reports an unused import in `app.tsx`, that is Step 4 not finished.

- [ ] **Step 6: Verify in the browser**

Open a class → Carnets. Expected: the class's carnets are listed and nothing from another class is; creating one asks only for a subject and a name; opening one shows the grid; deleting it from the grid returns to the Carnets tab and the schedule entry that pointed at it still exists in Emploi du temps, without a carnet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(class): carnets live in the class, and the flat list goes"
```

---

### Task 5: The Journal tab

**Files:**
- Create: `src/modules/class/tabs/diary.tsx`
- Modify: `src/modules/diary/page.tsx`

**Interfaces:**
- Consumes: `ClassTabProps`.
- Produces: `DiaryPage` takes an optional `{ classId?: string }`.

- [ ] **Step 1: Let the journal be pinned to one class**

In `src/modules/diary/page.tsx`:

```tsx
/**
 * … existing docstring …
 *
 * `classId` pins the page to one class and hides the class selector: that is
 * the class hub's Journal tab. A second calendar over the same tables was
 * rejected for the same reason phase 4b rejected one — it would be one more
 * thing to keep in sync.
 */
export function DiaryPage({ classId: pinnedClassId }: { classId?: string } = {}) {
```

Seed the existing filter state from the prop and let the prop win:

```tsx
  const [classId, setClassId] = useState<string | null>(pinnedClassId ?? null);
  const effectiveClassId = pinnedClassId ?? classId;
```

Use `effectiveClassId` everywhere `classId` is read, and render the class selector only when `pinnedClassId === undefined`.

- [ ] **Step 2: Write the tab**

Create `src/modules/class/tabs/diary.tsx`:

```tsx
import { DiaryPage } from "../../diary/page";
import type { ClassTabProps } from "./types";

/** The journal, pinned to this class. Same page, same tables, no selector. */
export function ClassDiaryTab({ classId }: ClassTabProps) {
  return <DiaryPage classId={classId} />;
}
```

Render it from the shell for `tab === "diary"`.

- [ ] **Step 3: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: green.

- [ ] **Step 4: Verify in the browser**

Class → Journal: only this class's entries and lessons, no class selector, the agenda/week toggle still works. Write an entry, then open `/diary` from the drawer: the same entry is there, with the selector back.

- [ ] **Step 5: Commit**

```bash
git add src/modules/class src/modules/diary
git commit -m "feat(class): the journal, pinned to the class"
```

---

### Task 6: Inbound links and the documentation

**Files:**
- Modify: `src/modules/today/page.tsx`
- Modify: `src/modules/student/page.tsx`
- Modify: `src/modules/classes/page.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Retarget every link**

Search for the removed route names and fix each: `grep -rn "Router.Plan\|Router.Gradebooks()" src/`. `Router.Plan({ classId })` becomes `Router.ClassPlan({ classId })`; the URL is unchanged, so nothing about Today's behaviour changes. Each lesson on Today also gains a link to its class.

- [ ] **Step 2: Update `CLAUDE.md`**

Rewrite the routes list in the Architecture section, and replace the drawer's destination list ("Aujourd'hui, Classes, Carnets, Élèves, Emploi du temps, Journal, Réglages") with the six that remain. Add a short section recording that the class hub is the app's centre of gravity, that `/gradebooks` was removed deliberately as a reversal of phase 4a, and why — pointing at the spec for the argument.

- [ ] **Step 3: Run the gate**

Run: `yarn format && yarn lint && yarn typecheck && yarn test`
Expected: green.

- [ ] **Step 4: Full-flow verification in the browser**

Walk the spec's eight-step verification list end to end, including the workspace switch with a class page open.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: record the class hub, and retarget every link into it"
```

---

## Self-review

- **Spec coverage.** Routes (Task 1), shell and shared selections (Task 1), roster tab (Task 1), plan tab (Task 2), pupil card from the roster with session-gated attendance (Task 3), Carnets tab and the removal of `/gradebooks` and its drawer entry (Task 4), gradebook form moved and class-implied (Task 4), post-delete navigation (Task 4), Journal tab without a second calendar (Task 5), inbound links and docs (Task 6), loading discipline (Task 1 Step 3), i18n parity (Tasks 1, 3).
- **No placeholders.** Every step carries the code or the exact command.
- **Type consistency.** `ClassTabProps` is defined once in Task 1 and consumed unchanged in Tasks 2–5; `PlanPage`'s new signature in Task 2 matches what `ClassPlanTab` passes; `StudentCard`'s `session?: Session | null` in Task 3 matches both call sites.
