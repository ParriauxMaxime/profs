import "fake-indexeddb/auto";
import { attendanceKey, openWorkspaceDb } from ".";
import {
  clearAttendance,
  markRemainingPresent,
  setAttendance,
  toggleAttendance,
} from "./attendance";

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

describe("markRemainingPresent", () => {
  it("marks every pupil who had no row", async () => {
    const db = freshDb("mark-all");
    await markRemainingPresent(db, "sess1", ["s1", "s2", "s3"]);

    for (const id of ["s1", "s2", "s3"]) {
      expect((await db.attendance.get(attendanceKey("sess1", id)))?.value).toBe("present");
    }
    db.close();
  });

  // The whole reason it is "remaining" and not "all": a teacher marks the two
  // absences they can see, then taps the button for the rest. Overwriting
  // would silently un-record the marks they had just made.
  it("leaves an existing mark alone, whatever it is", async () => {
    const db = freshDb("mark-keeps");
    await setAttendance(db, "sess1", "s1", "absent");
    await setAttendance(db, "sess1", "s2", "present");

    await markRemainingPresent(db, "sess1", ["s1", "s2", "s3"]);

    expect((await db.attendance.get(attendanceKey("sess1", "s1")))?.value).toBe("absent");
    expect((await db.attendance.get(attendanceKey("sess1", "s2")))?.value).toBe("present");
    expect((await db.attendance.get(attendanceKey("sess1", "s3")))?.value).toBe("present");
    db.close();
  });

  it("touches no other séance", async () => {
    const db = freshDb("mark-scoped");
    await markRemainingPresent(db, "sess1", ["s1"]);

    expect(await db.attendance.get(attendanceKey("sess2", "s1"))).toBeUndefined();
    db.close();
  });

  it("writes nothing when everyone is already marked", async () => {
    const db = freshDb("mark-none");
    await setAttendance(db, "sess1", "s1", "late");
    const before = (await db.attendance.get(attendanceKey("sess1", "s1")))?.updatedAt;

    await markRemainingPresent(db, "sess1", ["s1"]);

    expect((await db.attendance.get(attendanceKey("sess1", "s1")))?.updatedAt).toBe(before);
    expect(await db.attendance.count()).toBe(1);
    db.close();
  });
});
