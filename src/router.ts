import { createRouter } from "@swan-io/chicane";

const basePath = __BASE_PATH__ === "/" ? "" : __BASE_PATH__.replace(/\/$/, "");

export const Router = createRouter(
  {
    // `date` names a DAY, never a week — the width decides whether the front
    // door draws that day's week or that single day, so a phone and a tablet
    // read the same param differently rather than needing two URLs.
    Home: "/?:date",
    // A list page's filter lives in its URL: row-click navigation makes "go
    // in, come back" the primary loop, and a teacher who typed six characters
    // to find a pupil should not retype them after looking at that pupil.
    // Written with `replace`, never `push` — a push per keystroke makes Back
    // walk "bernard" one character at a time.
    Classes: "/classes?:q&:sort&:dir",
    Students: "/students?:q&:classe&:sort&:dir",
    Schedule: "/schedule",
    // A salle belongs to the établissement, not to a class, so it is a
    // destination of its own rather than a panel inside one.
    Rooms: "/salles",
    Room: "/salles/:roomId",
    // A class is ONE page: the séance, with the roster and the archive as
    // detours that keep their own URLs. The four tab routes it replaced
    // redirect, so older links and bookmarks still land somewhere real — see
    // the *Legacy routes and `app.tsx`.
    //
    // `date` and `at` name WHICH lesson is on screen — the day at local
    // midnight, and minutes from midnight. Both optional: without them the
    // page resolves the day itself, and neither creates anything. They are
    // search params rather than path segments because a lesson is one page
    // seen from a different hour, not a different destination.
    Class: "/classes/:classId?:date&:at",
    ClassStudents: "/classes/:classId/eleves",
    ClassDiary: "/classes/:classId/journal",
    // Kept only so an old link or bookmark to a tab still resolves — each
    // redirects to `Class` in `app.tsx` rather than rendering.
    ClassPlanLegacy: "/classes/:classId/plan",
    ClassStudentsLegacy: "/classes/:classId/students",
    ClassBooksLegacy: "/classes/:classId/books",
    ClassDiaryLegacy: "/classes/:classId/diary",
    Student: "/students/:studentId",
    Gradebook: "/gradebooks/:gradebookId",
    Entry: "/gradebooks/:gradebookId/entry/:columnId",
    Rubrics: "/gradebooks/:gradebookId/rubrics",
    Rubric: "/gradebooks/:gradebookId/rubrics/:assessmentId",
    Settings: "/settings",
    Design: "/design",
  },
  { basePath },
);
