import { deleteClass } from "@db/cascade";
import { useDb } from "@db/provider";
import { Link } from "@swan-io/chicane";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../router";
import { ConfirmButton } from "../design-system/components/confirm-button";
import { ClassForm } from "./components/class-form";
import { GroupFilter } from "./components/group-filter";
import { ClassBooksTab } from "./tabs/books";
import { ClassPlanTab } from "./tabs/plan";
import type { ClassTabProps } from "./tabs/types";

// The roster and the journal moved to their own routes (`/eleves`,
// `/journal`) in the class-one-pager work — see ClassStudentsPage and the
// ClassDiary route in app.tsx. What is left of the tab set lives only inside
// this shell, switched locally rather than by URL, because the class route
// itself no longer carries a tab segment. This whole shell is rewritten in
// the next task, once the class becomes one page rather than a tab set.
const HUB_TABS = ["plan", "books"] as const;
type HubTab = (typeof HUB_TABS)[number];

/**
 * A class, for now still mostly the tab set it has been since phase 6: the
 * seating plan and the carnets switch in place, while the roster and the
 * journal are separate destinations linked from the tab bar.
 *
 * The shell loads what its own tabs need (the class, its pupils, its groups
 * and their memberships) exactly once, so switching between Plan and Carnets
 * never flashes "Chargement…" over a class whose name is already on screen.
 */
export function ClassPage({ classId }: { classId: string }) {
  const { t } = useTranslation();
  const db = useDb();
  const [renaming, setRenaming] = useState(false);
  const [tab, setTab] = useState<HubTab>("plan");
  // Held as a group id, never an index: a deleted group falls back to "Tous",
  // not to whatever now sits at that position.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Held as a session id, never a position — the seating plan keeps it in
  // step with today's lesson.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // An explicit null distinguishes "no such class" from "still loading":
  // useLiveQuery gives undefined for both, and the page would otherwise sit on
  // "Chargement…" forever for a class that has been deleted.
  const schoolClass = useLiveQuery(
    async () => (await db.classes.get(classId)) ?? null,
    [db, classId],
  );
  const students = useLiveQuery(
    () => db.students.where("classId").equals(classId).sortBy("lastName"),
    [db, classId],
  );
  const groups = useLiveQuery(
    () => db.studentGroups.where("classId").equals(classId).sortBy("name"),
    [db, classId],
  );
  const memberships = useLiveQuery(async () => {
    if (!groups || groups.length === 0) return [];
    const groupIds = groups.map((g) => g.id);
    return await db.groupMembers.where("groupId").anyOf(groupIds).toArray();
  }, [db, groups]);

  if (schoolClass === undefined || students === undefined || groups === undefined) {
    return <p className="text-text-muted">{t("common.loading")}</p>;
  }
  if (schoolClass === null) return <p className="text-text-muted">{t("class.notFound")}</p>;

  const tabProps: ClassTabProps = {
    classId,
    students,
    groups,
    memberships: memberships ?? [],
    selectedGroupId,
    onSelectGroup: setSelectedGroupId,
    selectedSessionId,
    onSelectSession: setSelectedSessionId,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-lg">{schoolClass.name}</h2>
          {schoolClass.level && (
            <span className="text-sm text-text-muted">{schoolClass.level}</span>
          )}
          <span className="text-sm text-text-faint">
            {t("dashboard.studentCount", { count: students.length })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setRenaming(true)}>
            {t("class.rename")}
          </button>
          <ConfirmButton
            danger
            label={t("class.deleteClass")}
            confirmLabel={t("class.confirmDeleteClass")}
            body={t("class.confirmDeleteClassBody")}
            onConfirm={async () => {
              await deleteClass(db, classId);
              // The class page cannot survive its own class: without this the
              // route would render "Classe introuvable" instead of going back
              // to a list the teacher can act on.
              Router.push("Home");
            }}
          />
        </div>
      </div>

      {renaming && (
        // Keyed by class id: the form captures its defaults at mount.
        <ClassForm
          key={schoolClass.id}
          schoolClass={schoolClass}
          onDone={() => setRenaming(false)}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-2 border-border border-b">
        <nav className="flex gap-1" aria-label={t("class.tabs")}>
          {HUB_TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              className={`rounded-t px-3 py-2 font-medium text-sm hover:bg-bg-hover hover:text-text ${
                name === tab ? "bg-bg-hover text-text" : "text-text-muted"
              }`}
              aria-current={name === tab ? "page" : undefined}
            >
              {t(`class.tab.${name}`)}
            </button>
          ))}
          {/* The roster and the journal are separate destinations now, not
              panels of this shell — plain navigation links rather than the
              in-place tab buttons above. */}
          <Link
            to={Router.ClassStudents({ classId })}
            className="rounded-t px-3 py-2 font-medium text-sm text-text-muted hover:bg-bg-hover hover:text-text"
          >
            {t("class.tab.students")}
          </Link>
          <Link
            to={Router.ClassDiary({ classId })}
            className="rounded-t px-3 py-2 font-medium text-sm text-text-muted hover:bg-bg-hover hover:text-text"
          >
            {t("class.tab.diary")}
          </Link>
        </nav>

        {/* One filter for the whole shell, not one per tab: filtering the
            plan to a group and finding the carnets unfiltered reads as a bug.
            It shows only on the plan tab — a filter that changes nothing on
            screen is worse than no filter. */}
        {groups.length > 0 && tab === "plan" && (
          <div className="pb-1">
            <GroupFilter
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={setSelectedGroupId}
            />
          </div>
        )}
      </div>

      {tab === "plan" && <ClassPlanTab {...tabProps} />}
      {tab === "books" && <ClassBooksTab {...tabProps} />}
    </div>
  );
}
