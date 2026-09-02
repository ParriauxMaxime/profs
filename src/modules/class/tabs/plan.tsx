import { PlanPage } from "../../plan/page";
import type { ClassTabProps } from "./types";

/**
 * The seating plan, inside the class hub.
 *
 * A wrapper rather than a move: the plan module owns a live gesture — a pupil
 * held in the hand, a room being resized — and that gesture's code is worth
 * keeping together in its own module.
 */
export function ClassPlanTab({
  classId,
  students,
  memberships,
  selectedGroupId,
  selectedSessionId,
  onSelectSession,
}: ClassTabProps) {
  return (
    <PlanPage
      classId={classId}
      students={students}
      memberships={memberships}
      selectedGroupId={selectedGroupId}
      selectedSessionId={selectedSessionId}
      onSelectSession={onSelectSession}
    />
  );
}
