import { createRouter } from "@swan-io/chicane";

const basePath = __BASE_PATH__ === "/" ? "" : __BASE_PATH__.replace(/\/$/, "");

export const Router = createRouter(
  {
    Home: "/",
    Classes: "/classes",
    Students: "/students",
    Schedule: "/schedule",
    Diary: "/diary",
    // A class is one page with four tabs, and a route per tab: the back button
    // steps between them, a reload keeps the one you were on, and Aujourd'hui
    // can link straight to a lesson's seating plan. `Class` itself only
    // redirects — see `app.tsx`.
    Class: "/classes/:classId",
    ClassPlan: "/classes/:classId/plan",
    ClassStudents: "/classes/:classId/students",
    ClassBooks: "/classes/:classId/books",
    ClassDiary: "/classes/:classId/diary",
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
