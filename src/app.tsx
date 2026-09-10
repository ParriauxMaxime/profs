import { ClassPage } from "./modules/class/page";
import { ClassStudentsPage } from "./modules/class/students-page";
import { ClassesPage } from "./modules/classes/page";
import { DesignPage } from "./modules/design-system/page";
import { DiaryPage } from "./modules/diary/page";
import { EntryPage } from "./modules/entry/page";
import { GradebookPage } from "./modules/gradebook/page";
import { RoomEditorPage } from "./modules/rooms/editor";
import { RoomsPage } from "./modules/rooms/page";
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
    "Rooms",
    "Room",
    "Class",
    "ClassStudents",
    "ClassDiary",
    "ClassPlanLegacy",
    "ClassStudentsLegacy",
    "ClassBooksLegacy",
    "ClassDiaryLegacy",
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
      | "Rooms"
      | "Room"
      | "Class"
      | "ClassStudents"
      | "ClassDiary"
      | "ClassPlanLegacy"
      | "ClassStudentsLegacy"
      | "ClassBooksLegacy"
      | "ClassDiaryLegacy"
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
      return <TodayPage date={route.params.date} />;
    case "Classes":
      return <ClassesPage q={route.params.q} sort={route.params.sort} dir={route.params.dir} />;
    case "Students":
      return (
        <StudentsPage
          q={route.params.q}
          classe={route.params.classe}
          sort={route.params.sort}
          dir={route.params.dir}
        />
      );
    case "Schedule":
      return <SchedulePage />;
    case "Rooms":
      return <RoomsPage />;
    case "Room":
      return <RoomEditorPage roomId={route.params.roomId} />;
    case "Class":
      // The class page renders the lesson directly now; there is no longer a
      // separate tab route to redirect to. `date` and `at` say which lesson,
      // and are absent far more often than not.
      return (
        <ClassPage classId={route.params.classId} date={route.params.date} at={route.params.at} />
      );
    case "ClassStudents":
      return (
        <ClassStudentsPage
          classId={route.params.classId}
          q={route.params.q}
          groupe={route.params.groupe}
          sort={route.params.sort}
          dir={route.params.dir}
        />
      );
    case "ClassDiary":
      // The journal is one class's archive and nothing else: DiaryPage takes
      // the class it reads, so there is no wrapper and no selector.
      return <DiaryPage classId={route.params.classId} />;
    case "ClassPlanLegacy":
    case "ClassStudentsLegacy":
    case "ClassBooksLegacy":
    case "ClassDiaryLegacy":
      // The four tabs a class used to have as separate routes. Old links and
      // bookmarks still resolve, just onto the one page a class is now.
      Router.replace("Class", { classId: route.params.classId });
      return null;
    case "Student":
      return (
        <StudentPage
          studentId={route.params.studentId}
          q={route.params.q}
          classe={route.params.classe}
          groupe={route.params.groupe}
          sort={route.params.sort}
          dir={route.params.dir}
        />
      );
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
