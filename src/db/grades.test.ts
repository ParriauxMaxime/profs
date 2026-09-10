import "fake-indexeddb/auto";
import { gradeKey, openWorkspaceDb } from ".";
import { clearGradeNote, setGradeNote, writeGrade } from "./grades";

function freshDb(label: string) {
  return openWorkspaceDb(`grades-${label}-${crypto.randomUUID()}`);
}

describe("setGradeNote", () => {
  it("adds a note to an existing mark without touching the value", async () => {
    const db = freshDb("note-add");
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
    const db = freshDb("note-only");
    await setGradeNote(db, "g1", "c1", "p1", "absent, à rattraper");
    const row = await db.grades.get(gradeKey("g1", "c1", "p1"));
    expect(row?.note).toBe("absent, à rattraper");
    expect(row?.value).toBeUndefined();
  });

  it("trims, and a blank note clears rather than storing whitespace", async () => {
    const db = freshDb("note-trim");
    await setGradeNote(db, "g1", "c1", "p1", "  revoir  ");
    expect((await db.grades.get(gradeKey("g1", "c1", "p1")))?.note).toBe("revoir");
    await setGradeNote(db, "g1", "c1", "p1", "   ");
    expect((await db.grades.get(gradeKey("g1", "c1", "p1")))?.note).toBeUndefined();
  });
});

describe("clearGradeNote", () => {
  it("removes the note and keeps the mark", async () => {
    const db = freshDb("note-clear-keep");
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
    const db = freshDb("note-clear-delete");
    await setGradeNote(db, "g1", "c1", "p1", "à rattraper");
    await clearGradeNote(db, "g1", "c1", "p1");
    // A row with neither value nor note is invisible everywhere and would be
    // carried by export forever. It must not survive.
    expect(await db.grades.get(gradeKey("g1", "c1", "p1"))).toBeUndefined();
    expect(await db.grades.count()).toBe(0);
  });
});

describe("writeGrade", () => {
  it("stores a mark", async () => {
    const db = freshDb("store");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });

    expect((await db.grades.get(gradeKey("gb1", "c1", "s1")))?.value).toEqual({
      type: "numeric",
      value: 14,
    });
    db.close();
  });

  it("replaces a mark rather than adding a second row", async () => {
    const db = freshDb("replace");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 9 });

    expect(await db.grades.count()).toBe(1);
    expect((await db.grades.get(gradeKey("gb1", "c1", "s1")))?.value).toEqual({
      type: "numeric",
      value: 9,
    });
    db.close();
  });

  it("deletes the row outright when a cleared cell has no note", async () => {
    const db = freshDb("clear");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });
    await writeGrade(db, "gb1", "c1", "s1", null);

    expect(await db.grades.get(gradeKey("gb1", "c1", "s1"))).toBeUndefined();
    db.close();
  });

  it("keeps the note when the mark is cleared", async () => {
    const db = freshDb("keep-note");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 14 });
    await setGradeNote(db, "gb1", "c1", "s1", "à rattraper");
    await writeGrade(db, "gb1", "c1", "s1", null);

    const row = await db.grades.get(gradeKey("gb1", "c1", "s1"));
    expect(row?.note).toBe("à rattraper");
    expect(row?.value).toBeUndefined();
    db.close();
  });

  // The drift this extraction exists to remove. The grid built its `put` from
  // a render-time snapshot, so a note written after that render — by the note
  // field's own blur, or by another surface on the same row — was carried
  // forward as `undefined` and silently lost. Re-reading inside the
  // transaction is what the fast-entry screen already did.
  it("carries a note written after the caller last read the row", async () => {
    const db = freshDb("stale");
    await setGradeNote(db, "gb1", "c1", "s1", "absent, à rattraper");
    await writeGrade(db, "gb1", "c1", "s1", { type: "numeric", value: 11 });

    const row = await db.grades.get(gradeKey("gb1", "c1", "s1"));
    expect(row?.note).toBe("absent, à rattraper");
    expect(row?.value).toEqual({ type: "numeric", value: 11 });
    db.close();
  });

  it("writes nothing when clearing a cell that was never stored", async () => {
    const db = freshDb("noop");
    await writeGrade(db, "gb1", "c1", "s1", null);

    expect(await db.grades.count()).toBe(0);
    db.close();
  });
});
