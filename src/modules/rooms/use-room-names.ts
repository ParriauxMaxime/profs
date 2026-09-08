import { useDb } from "@db/provider";
import { listRooms } from "@db/rooms";
import { useLiveQuery } from "dexie-react-hooks";

/**
 * Salle names by id, for the screens that only need to LABEL one.
 *
 * The timetable, Today and the journal all show which room a lesson is in and
 * none of them care about its furniture. A hook rather than three copies of
 * the same live query, and `db` is in its dependency array like every other
 * one here — without that a workspace switch keeps rendering the previous
 * school's room names against the new school's lessons.
 *
 * Returns an empty map while loading, so a caller renders no name rather than
 * flashing "Chargement…" beside every lesson in the week.
 */
export function useRoomNames(): Map<string, string> {
  const db = useDb();
  const rooms = useLiveQuery(() => listRooms(db), [db]);
  return new Map((rooms ?? []).map((room) => [room.id, room.name]));
}
