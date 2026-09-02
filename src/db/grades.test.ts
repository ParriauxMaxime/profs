import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";
import { clearGradeNote, setGradeNote } from "./grades";

function freshDb() {
  return openWorkspaceDb(`grades-${crypto.randomUUID()}`);
}

describe("setGradeNote", () => {
  it("adds a note to an existing mark without touching the value", async () => {
    const db = freshDb();
    await db.grades.put({
      gradebookId: "g1",
      columnId: "c1",
      studentId: "p1",
      value: { type: "numeric", value: 14 },
      updatedAt: 1,
    });
    await setGradeNote(db, "g1", "c1", "p1", "copie rendue en retard");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBe("copie rendue en retard");
    expect(row?.value).toEqual({ type: "numeric", value: 14 });
  });

  it("creates a note-only row when there is no mark yet", async () => {
    const db = freshDb();
    await setGradeNote(db, "g1", "c1", "p1", "absent, à rattraper");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBe("absent, à rattraper");
    expect(row?.value).toBeUndefined();
  });

  it("trims, and a blank note clears rather than storing whitespace", async () => {
    const db = freshDb();
    await setGradeNote(db, "g1", "c1", "p1", "  revoir  ");
    expect((await db.grades.get(gradeKey("g1", "c1", "p1")))?.note).toBe("revoir");
    await setGradeNote(db, "g1", "c1", "p1", "   ");
    expect((await db.grades.get(gradeKey("g1", "c1", "p1")))?.note).toBeUndefined();
  });
});

describe("clearGradeNote", () => {
  it("removes the note and keeps the mark", async () => {
    const db = freshDb();
    await db.grades.put({
      gradebookId: "g1",
      columnId: "c1",
      studentId: "p1",
      value: { type: "numeric", value: 12 },
      note: "bien",
      updatedAt: 1,
    });
    await clearGradeNote(db, "g1", "c1", "p1");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBeUndefined();
    expect(row?.value).toEqual({ type: "numeric", value: 12 });
  });

  it("deletes the row entirely when only the note remained", async () => {
    const db = freshDb();
    await setGradeNote(db, "g1", "c1", "p1", "à rattraper");
    await clearGradeNote(db, "g1", "c1", "p1");
    // A row with neither value nor note is invisible everywhere and would be
    // carried by export forever. It must not survive.
    expect(await db.grades.get(gradeKey("g1", "c1", "p1"))).toBeUndefined();
    expect(await db.grades.count()).toBe(0);
  });
});
