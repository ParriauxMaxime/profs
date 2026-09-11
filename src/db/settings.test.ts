import "fake-indexeddb/auto";
import { DEFAULT_ESCALATION } from "@domain/escalation";
import { openWorkspaceDb } from ".";
import { readEscalation, WORKSPACE_SETTINGS_ID, writeEscalation } from "./settings";

describe("the escalation setting", () => {
  it("reads the default when no row has been written", async () => {
    const db = openWorkspaceDb(`settings-empty-${crypto.randomUUID()}`);
    expect(await readEscalation(db)).toEqual(DEFAULT_ESCALATION);
    db.close();
  });

  it("round-trips a rule through one row", async () => {
    const db = openWorkspaceDb(`settings-write-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 4, yellows: 3 });
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 4, yellows: 3 });
    expect(await db.settings.count()).toBe(1);
    db.close();
  });

  it("keeps writing to the same row rather than accumulating", async () => {
    const db = openWorkspaceDb(`settings-once-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 3, yellows: 2 });
    await writeEscalation(db, { enabled: false, seances: 5, yellows: 4 });
    expect(await db.settings.count()).toBe(1);
    expect(await readEscalation(db)).toEqual({ enabled: false, seances: 5, yellows: 4 });
    db.close();
  });

  it("clamps on the way in, so no stored rule is inexpressible", async () => {
    const db = openWorkspaceDb(`settings-clamp-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 0, yellows: 1 });
    // Read the row directly rather than through `readEscalation`, which
    // re-clamps on every read regardless — that would pass even if
    // `writeEscalation` stored the raw, unclamped rule.
    const row = await db.settings.get(WORKSPACE_SETTINGS_ID);
    expect(row?.escalation).toEqual({ enabled: true, seances: 1, yellows: 2 });
    db.close();
  });

  it("clamps on the way out, so a hand-edited import cannot install one either", async () => {
    const db = openWorkspaceDb(`settings-import-${crypto.randomUUID()}`);
    await db.settings.put({
      id: WORKSPACE_SETTINGS_ID,
      escalation: { enabled: true, seances: 99, yellows: 1 },
    });
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 10, yellows: 2 });
    db.close();
  });

  it("merges a patch against the stored row rather than replacing it", async () => {
    // The bug this guards: a `put` built from a render-time snapshot drops
    // whatever another surface wrote since that snapshot was taken. Two
    // sequential PATCHES — the shape every call site now sends — must
    // compose, each keeping what the other did not touch.
    const db = openWorkspaceDb(`settings-patch-${crypto.randomUUID()}`);
    await writeEscalation(db, { enabled: true, seances: 4, yellows: 3 });
    await writeEscalation(db, { yellows: 5 });
    expect(await readEscalation(db)).toEqual({ enabled: true, seances: 4, yellows: 5 });
    db.close();
  });

  it("falls back to the default for a row carrying no rule at all", async () => {
    const db = openWorkspaceDb(`settings-husk-${crypto.randomUUID()}`);
    // What a hand-edited backup could put there.
    await db.settings.put({ id: WORKSPACE_SETTINGS_ID } as never);
    expect(await readEscalation(db)).toEqual(DEFAULT_ESCALATION);
    db.close();
  });
});
