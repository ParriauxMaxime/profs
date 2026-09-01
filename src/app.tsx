import { ClassPage } from "./modules/class/page";
import { DashboardPage } from "./modules/dashboard/page";
import { DesignPage } from "./modules/design-system/page";
import { EntryPage } from "./modules/entry/page";
import { GradebookPage } from "./modules/gradebook/page";
import { PlanPage } from "./modules/plan/page";
import { RubricAssessmentPage, RubricsPage } from "./modules/rubric/page";
import { SettingsPage } from "./modules/settings/page";
import { AdminLayout } from "./modules/shared/components/admin-layout";
import { StudentPage } from "./modules/student/page";
import { Router } from "./router";

export function App() {
  const route = Router.useRoute([
    "Home",
    "Class",
    "Plan",
    "Student",
    "Gradebook",
    "Entry",
    "Rubrics",
    "Rubric",
    "Settings",
    "Design",
  ]);

  if (!route) {
    Router.replace("Home");
    return null;
  }

  return (
    <AdminLayout>
      <Routes route={route} />
    </AdminLayout>
  );
}

type AppRoute = NonNullable<
  ReturnType<
    typeof Router.useRoute<
      | "Home"
      | "Class"
      | "Plan"
      | "Student"
      | "Gradebook"
      | "Entry"
      | "Rubrics"
      | "Rubric"
      | "Settings"
      | "Design"
    >
  >
>;

function Routes({ route }: { route: AppRoute }) {
  switch (route.name) {
    case "Home":
      return <DashboardPage />;
    case "Class":
      return <ClassPage classId={route.params.classId} />;
    case "Plan":
      return <PlanPage classId={route.params.classId} />;
    case "Student":
      return <StudentPage studentId={route.params.studentId} />;
    case "Gradebook":
      return <GradebookPage gradebookId={route.params.gradebookId} />;
    case "Entry":
      return <EntryPage gradebookId={route.params.gradebookId} columnId={route.params.columnId} />;
    case "Rubrics":
      return <RubricsPage gradebookId={route.params.gradebookId} />;
    case "Rubric":
      return (
        <RubricAssessmentPage
          gradebookId={route.params.gradebookId}
          assessmentId={route.params.assessmentId}
        />
      );
    case "Settings":
      return <SettingsPage />;
    case "Design":
      return <DesignPage />;
  }
}
