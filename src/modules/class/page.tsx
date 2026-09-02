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
import { ClassDiaryTab } from "./tabs/diary";
import { ClassPlanTab } from "./tabs/plan";
import { ClassStudentsTab } from "./tabs/students";
import type { ClassTabProps } from "./tabs/types";

export const CLASS_TABS = ["plan", "students", "books", "diary"] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

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

/**
 * A class is one page. The seating plan, the roster, the carnets and the
 * journal are tabs of it rather than four destinations reached through the
 * drawer, because a teacher does not think in carnets and rosters — they think
 * in 3°B, and everything about 3°B should be one page.
 *
 * The shell loads what every tab needs (the class, its pupils, its groups and
 * their memberships) exactly once, so changing tab never flashes "Chargement…"
 * over a class whose name is already on screen.
 */
export function ClassPage({ classId, tab }: { classId: string; tab: ClassTab }) {
  const { t } = useTranslation();
  const db = useDb();
  const [renaming, setRenaming] = useState(false);
  // Held as a group id, never an index: a deleted group falls back to "Tous",
  // not to whatever now sits at that position.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  // Held as a session id, never a position. The Plan tab keeps it in step with
  // today's lesson; the roster only reads it, to decide whether the pupil card
  // may record attendance at all.
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
          {CLASS_TABS.map((name) => (
            <Link
              key={name}
              to={tabHref(name, classId)}
              className="rounded-t px-3 py-2 font-medium text-sm text-text-muted hover:bg-bg-hover hover:text-text"
              activeClassName="bg-bg-hover text-text"
              // Chicane sets activeClassName on an exact match; aria-current
              // has to be told separately or a screen reader never learns
              // which tab is the current one.
              aria-current={name === tab ? "page" : undefined}
            >
              {t(`class.tab.${name}`)}
            </Link>
          ))}
        </nav>

        {/* One filter for the whole class, not one per tab: filtering the
            roster to a group and finding the seating plan unfiltered reads as
            a bug. It shows only on the two tabs that list pupils — a filter
            that changes nothing on screen is worse than no filter. */}
        {groups.length > 0 && (tab === "plan" || tab === "students") && (
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
      {tab === "students" && <ClassStudentsTab {...tabProps} />}
      {tab === "books" && <ClassBooksTab {...tabProps} />}
      {tab === "diary" && <ClassDiaryTab {...tabProps} />}
    </div>
  );
}
