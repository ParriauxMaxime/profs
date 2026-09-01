import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { exportWorkspace, importWorkspace } from "./backup";
import { seedIfEmpty } from "./seed";

describe("workspace backup", () => {
  it("round-trips a seeded workspace into an empty one", async () => {
    const source = openWorkspaceDb("backup-source");
    await seedIfEmpty(source);
    const backup = await exportWorkspace(source);

    const target = openWorkspaceDb("backup-target");
    await importWorkspace(target, JSON.parse(JSON.stringify(backup)));

    expect(await target.classes.count()).toBe(await source.classes.count());
    expect(await target.students.count()).toBe(await source.students.count());
    expect(await target.grades.count()).toBe(await source.grades.count());
    source.close();
    target.close();
  });

  it("replaces existing content rather than merging into it", async () => {
    const source = openWorkspaceDb("backup-replace-source");
    await seedIfEmpty(source);
    const backup = await exportWorkspace(source);

    const target = openWorkspaceDb("backup-replace-target");
    await seedIfEmpty(target);
    await importWorkspace(target, JSON.parse(JSON.stringify(backup)));

    expect(await target.classes.count()).toBe(2);
    source.close();
    target.close();
  });

  it("rejects a payload that is not a backup", async () => {
    const db = openWorkspaceDb("backup-bad");
    await expect(importWorkspace(db, { hello: "world" })).rejects.toThrow();
    db.close();
  });

  it("rejects a backup from a future version", async () => {
    const db = openWorkspaceDb("backup-future");
    await expect(
      importWorkspace(db, {
        version: 2,
        exportedAt: 0,
        classes: [],
        students: [],
        subjects: [],
        gradebooks: [],
        periods: [],
        columns: [],
        grades: [],
      }),
    ).rejects.toThrow();
    db.close();
  });
});
