import "fake-indexeddb/auto";
import { attendanceKey, openWorkspaceDb, seatKey } from ".";

describe("schema v2", () => {
  it("builds an attendance key", () => {
    expect(attendanceKey("s1", "p1")).toEqual(["s1", "p1"]);
  });

  it("builds a seat key", () => {
    expect(seatKey("l1", 2, 3)).toEqual(["l1", 2, 3]);
  });

  it("opens with every phase 2 table", async () => {
    const db = openWorkspaceDb("schema-v2");
    await db.open();
    const names = db.tables.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "attendance",
        "behaviourEvents",
        "classes",
        "columns",
        "gradebooks",
        "grades",
        "periods",
        "seatingLayouts",
        "seats",
        "sessions",
        "students",
        "subjects",
      ].sort(),
    );
    db.close();
  });

  it("round-trips a seat on its compound key", async () => {
    const db = openWorkspaceDb("schema-v2-seat");
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: null });
    await db.seats.put({ layoutId: "l1", row: 0, col: 0, studentId: "p1" });
    expect(await db.seats.count()).toBe(1);
    expect(await db.seats.get(seatKey("l1", 0, 0))).toEqual({
      layoutId: "l1",
      row: 0,
      col: 0,
      studentId: "p1",
    });
    db.close();
  });
});
