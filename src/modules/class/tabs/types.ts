import type { GroupMember, Student, StudentGroup } from "@db";

/**
 * What every tab of the class hub receives.
 *
 * The class row, its pupils and its groups are loaded ONCE by the shell. A tab
 * that re-queried them would flash "Chargement…" over a class whose name is
 * already on screen, every time the teacher changes tab.
 *
 * The group filter and the selected session live in the shell for the same
 * reason they are shared at all: filtering the roster to "Groupe A" and then
 * finding the seating plan unfiltered reads as a bug. Both are held by
 * identity — a group id and a session id, never a position in a list.
 */
export interface ClassTabProps {
  classId: string;
  students: Student[];
  groups: StudentGroup[];
  memberships: GroupMember[];
  selectedGroupId: string | null;
  onSelectGroup: (groupId: string | null) => void;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
}
