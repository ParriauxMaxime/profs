import { createRouter } from "@swan-io/chicane";

const basePath = __BASE_PATH__ === "/" ? "" : __BASE_PATH__.replace(/\/$/, "");

export const Router = createRouter(
  {
    Home: "/",
    Classes: "/classes",
    Gradebooks: "/gradebooks",
    Students: "/students",
    Schedule: "/schedule",
    Class: "/classes/:classId",
    Plan: "/classes/:classId/plan",
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
