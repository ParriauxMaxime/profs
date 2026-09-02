import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { setStudentNotes, setStudentPhoto } from "./students";

function freshDb(label: string) {
  return openWorkspaceDb(`students-${label}-${crypto.randomUUID()}`);
}

async function withStudent(label: string) {
  const db = freshDb(label);
  await db.students.add({
    id: "s1",
    classId: "c1",
    firstName: "Camille",
    lastName: "Durand",
    createdAt: 1,
    updatedAt: 1,
  });
  return db;
}

describe("setStudentPhoto", () => {
  it("stores the blob and removes it again", async () => {
    const db = await withStudent("photo");
    await setStudentPhoto(db, "s1", new Blob(["x"], { type: "image/jpeg" }));
    expect((await db.students.get("s1"))?.photo).toBeInstanceOf(Blob);

    await setStudentPhoto(db, "s1", null);
    expect((await db.students.get("s1"))?.photo).toBeUndefined();
    db.close();
  });

  it("touches only the photo, never the pupil's other fields", async () => {
    const db = await withStudent("photo-isolated");
    await setStudentNotes(db, "s1", "PAP, tiers-temps");
    await setStudentPhoto(db, "s1", new Blob(["x"]));

    const student = await db.students.get("s1");
    expect(student?.notes).toBe("PAP, tiers-temps");
    expect(student?.lastName).toBe("Durand");
    db.close();
  });
});

describe("setStudentNotes", () => {
  it("stores trimmed notes", async () => {
    const db = await withStudent("notes");
    await setStudentNotes(db, "s1", "  PPRE en cours  ");

    expect((await db.students.get("s1"))?.notes).toBe("PPRE en cours");
    db.close();
  });

  it("treats cleared notes as absent, not as an empty string", async () => {
    const db = await withStudent("notes-clear");
    await setStudentNotes(db, "s1", "PAP");
    await setStudentNotes(db, "s1", "   ");

    expect((await db.students.get("s1"))?.notes).toBeUndefined();
    db.close();
  });
});
