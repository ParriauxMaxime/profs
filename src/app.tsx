import { ClassPage } from "./modules/class/page";
import { ClassesPage } from "./modules/classes/page";
import { DesignPage } from "./modules/design-system/page";
import { DiaryPage } from "./modules/diary/page";
import { EntryPage } from "./modules/entry/page";
import { GradebookPage } from "./modules/gradebook/page";
import { RubricAssessmentPage, RubricsPage } from "./modules/rubric/page";
import { SchedulePage } from "./modules/schedule/page";
import { SettingsPage } from "./modules/settings/page";
import { AdminLayout } from "./modules/shared/components/admin-layout";
import { useTheme } from "./modules/shared/use-theme";
import { StudentPage } from "./modules/student/page";
import { StudentsPage } from "./modules/students/page";
import { TodayPage } from "./modules/today/page";
import { Router } from "./router";

export function App() {
  // Applied here so every route is themed, including the ones that render
  // before Réglages has ever been opened.
  useTheme();

  const route = Router.useRoute([
    "Home",
    "Classes",
    "Students",
    "Schedule",
    "Diary",
    "Class",
    "ClassPlan",
    "ClassStudents",
    "ClassBooks",
    "ClassDiary",
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
      | "Classes"
      | "Students"
      | "Schedule"
      | "Diary"
      | "Class"
      | "ClassPlan"
      | "ClassStudents"
      | "ClassBooks"
      | "ClassDiary"
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
      return <TodayPage />;
    case "Classes":
      return <ClassesPage />;
    case "Students":
      return <StudentsPage />;
    case "Schedule":
      return <SchedulePage />;
    case "Diary":
      return <DiaryPage />;
    case "Class":
      // A class opens on its seating plan: that is the view a teacher reaches
      // for mid-lesson, and the tabs are routes, so the bare class URL has to
      // resolve to one of them.
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
