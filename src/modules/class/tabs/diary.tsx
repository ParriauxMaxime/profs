import { DiaryPage } from "../../diary/page";
import type { ClassTabProps } from "./types";

/**
 * The journal, pinned to this class.
 *
 * The same page and the same tables as `/diary`, with the class selector
 * hidden. A second calendar over `diaryEntries` was rejected for the reason
 * phase 4b rejected one: it would be one more thing to keep in sync, and a
 * calendar wrong by one day still looks exactly like a calendar.
 */
export function ClassDiaryTab({ classId }: ClassTabProps) {
  return <DiaryPage classId={classId} />;
}
