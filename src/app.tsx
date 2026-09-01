import { ClassPage } from "./modules/class/page";
import { DashboardPage } from "./modules/dashboard/page";
import { EntryPage } from "./modules/entry/page";
import { GradebookPage } from "./modules/gradebook/page";
import { AdminLayout } from "./modules/shared/components/admin-layout";
import { Router } from "./router";

export function App() {
  const route = Router.useRoute(["Home", "Class", "Gradebook", "Entry", "Settings"]);

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
  ReturnType<typeof Router.useRoute<"Home" | "Class" | "Gradebook" | "Entry" | "Settings">>
>;

function Routes({ route }: { route: AppRoute }) {
  switch (route.name) {
    case "Home":
      return <DashboardPage />;
    case "Class":
      return <ClassPage classId={route.params.classId} />;
    case "Gradebook":
      return <GradebookPage gradebookId={route.params.gradebookId} />;
    case "Entry":
      return <EntryPage gradebookId={route.params.gradebookId} columnId={route.params.columnId} />;
    case "Settings":
      return <p className="text-text-muted">…</p>;
  }
}
