import "fake-indexeddb/auto";
import { openWorkspaceDb } from ".";
import { newCriterion, saveTemplate } from "./rubrics";

function freshDb() {
  return openWorkspaceDb(`rubrics-${crypto.randomUUID()}`);
}

describe("newCriterion", () => {
  it("gives each criterion its own id", () => {
    expect(newCriterion("Clarté").id).not.toBe(newCriterion("Clarté").id);
  });
});

describe("saveTemplate", () => {
  it("creates a template and returns its id", async () => {
    const db = freshDb();
    const id = await saveTemplate(db, { name: "Oral", criteria: [newCriterion("Clarté")] });
    const stored = await db.rubricTemplates.get(id);
    expect(stored?.name).toBe("Oral");
    expect(stored?.criteria).toHaveLength(1);
    db.close();
  });

  it("updates in place without creating a second row", async () => {
    const db = freshDb();
    const id = await saveTemplate(db, { name: "Oral", criteria: [] });
    await saveTemplate(db, { templateId: id, name: "Exposé oral", criteria: [] });
    expect(await db.rubricTemplates.count()).toBe(1);
    expect((await db.rubricTemplates.get(id))?.name).toBe("Exposé oral");
    db.close();
  });

  it("trims the name and refuses an empty one", async () => {
    const db = freshDb();
    const id = await saveTemplate(db, { name: "  Oral  ", criteria: [] });
    expect((await db.rubricTemplates.get(id))?.name).toBe("Oral");
    await expect(saveTemplate(db, { name: "   ", criteria: [] })).rejects.toThrow();
    expect(await db.rubricTemplates.count()).toBe(1);
    db.close();
  });
});
