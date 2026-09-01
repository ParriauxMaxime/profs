import { createRouter } from "@swan-io/chicane";

const basePath = __BASE_PATH__ === "/" ? "" : __BASE_PATH__.replace(/\/$/, "");

export const Router = createRouter(
  {
    Home: "/",
    Class: "/classes/:classId",
    Plan: "/classes/:classId/plan",
    Student: "/students/:studentId",
    Gradebook: "/gradebooks/:gradebookId",
    Entry: "/gradebooks/:gradebookId/entry/:columnId",
    Settings: "/settings",
    Design: "/design",
  },
  { basePath },
);
