import "fake-indexeddb/auto";
import { attendanceKey, openWorkspaceDb } from ".";
import { clearAttendance, setAttendance, toggleAttendance } from "./attendance";

function freshDb(label: string) {
  return openWorkspaceDb(`attendance-${label}-${crypto.randomUUID()}`);
}

describe("setAttendance", () => {
  it("stores the raw domain string, never a translated label", async () => {
    const db = freshDb("set");
    await setAttendance(db, "sess1", "s1", "late");

    expect((await db.attendance.get(attendanceKey("sess1", "s1")))?.value).toBe("late");
    db.close();
  });

  it("replaces an existing mark rather than adding a second row", async () => {
    const db = freshDb("replace");
    await setAttendance(db, "sess1", "s1", "absent");
    await setAttendance(db, "sess1", "s1", "late");

    expect(await db.attendance.where("sessionId").equals("sess1").count()).toBe(1);
    expect((await db.attendance.get(attendanceKey("sess1", "s1")))?.value).toBe("late");
    db.close();
  });
});

describe("clearAttendance", () => {
  it("removes the row entirely — no mark is not a mark of present", async () => {
    const db = freshDb("clear");
    await setAttendance(db, "sess1", "s1", "absent");
    await clearAttendance(db, "sess1", "s1");

    expect(await db.attendance.get(attendanceKey("sess1", "s1"))).toBeUndefined();
    db.close();
  });
});

describe("toggleAttendance", () => {
  it("clears when tapped on the value already recorded", async () => {
    const db = freshDb("toggle-off");
    await toggleAttendance(db, "sess1", "s1", "absent");
    await toggleAttendance(db, "sess1", "s1", "absent");

    expect(await db.attendance.get(attendanceKey("sess1", "s1"))).toBeUndefined();
    db.close();
  });

  it("switches when tapped on a different value", async () => {
    const db = freshDb("toggle-switch");
    await toggleAttendance(db, "sess1", "s1", "absent");
    await toggleAttendance(db, "sess1", "s1", "excused");

    expect((await db.attendance.get(attendanceKey("sess1", "s1")))?.value).toBe("excused");
    db.close();
  });

  it("keeps each pupil's mark independent within one session", async () => {
    const db = freshDb("toggle-per-pupil");
    await toggleAttendance(db, "sess1", "s1", "absent");
    await toggleAttendance(db, "sess1", "s2", "absent");
    await toggleAttendance(db, "sess1", "s1", "absent");

    expect(await db.attendance.get(attendanceKey("sess1", "s1"))).toBeUndefined();
    expect((await db.attendance.get(attendanceKey("sess1", "s2")))?.value).toBe("absent");
    db.close();
  });
});
