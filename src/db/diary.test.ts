import "fake-indexeddb/auto";
import { diaryKey, openWorkspaceDb } from ".";
import { clearDiaryEntry, diaryForClass, diaryInRange, setDiaryEntry } from "./diary";

function freshDb(label: string) {
  return openWorkspaceDb(`diary-${label}-${crypto.randomUUID()}`);
}

const day = (y: number, m: number, d: number): number => new Date(y, m, d).getTime();

describe("setDiaryEntry", () => {
  it("writes one day's entry, trimmed", async () => {
    const db = freshDb("write");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "  on a fait les fractions  ");

    const entry = await db.diaryEntries.get(diaryKey("c1", day(2026, 8, 1)));
    expect(entry?.text).toBe("on a fait les fractions");
    db.close();
  });

  it("normalises the date, so the hour it was written does not matter", async () => {
    // Written at 21h on the sofa, corrected at 08h the next morning: one row,
    // not two.
    const db = freshDb("normalise");
    await setDiaryEntry(db, "c1", new Date(2026, 8, 1, 21, 30).getTime(), "le soir");
    await setDiaryEntry(db, "c1", new Date(2026, 8, 1, 8, 5).getTime(), "le matin");

    expect(await db.diaryEntries.count()).toBe(1);
    expect((await db.diaryEntries.get(diaryKey("c1", day(2026, 8, 1))))?.text).toBe("le matin");
    db.close();
  });

  it("keeps createdAt across an edit", async () => {
    const db = freshDb("created");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "premier jet");
    const first = await db.diaryEntries.get(diaryKey("c1", day(2026, 8, 1)));
    await new Promise((r) => setTimeout(r, 5));
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "corrigé");
    const second = await db.diaryEntries.get(diaryKey("c1", day(2026, 8, 1)));

    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.updatedAt).toBeGreaterThan(first?.updatedAt as number);
    db.close();
  });

  it("deletes the row when the text is blanked, never storing an empty husk", async () => {
    const db = freshDb("husk");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "quelque chose");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "   ");

    expect(await db.diaryEntries.get(diaryKey("c1", day(2026, 8, 1)))).toBeUndefined();
    expect(await db.diaryEntries.count()).toBe(0);
    db.close();
  });

  it("writes nothing at all for blank text on a day that never had an entry", async () => {
    const db = freshDb("blank-new");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "");

    expect(await db.diaryEntries.count()).toBe(0);
    db.close();
  });

  it("keeps each class's day separate", async () => {
    const db = freshDb("per-class");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "3°B");
    await setDiaryEntry(db, "c2", day(2026, 8, 1), "5°A");

    expect(await db.diaryEntries.count()).toBe(2);
    expect((await db.diaryEntries.get(diaryKey("c2", day(2026, 8, 1))))?.text).toBe("5°A");
    db.close();
  });

  it("creates NO session when writing about a future lesson", async () => {
    // The ruling this phase rests on. Phase 4a: the schedule predicts and
    // never pre-creates, so that holidays and cancellations leave no empty
    // session in a pupil's timeline. Writing next Thursday's plan must not
    // undo that.
    const db = freshDb("no-session");
    const future = day(2027, 5, 10);
    const before = await db.sessions.count();

    await setDiaryEntry(db, "c1", future, "prévoir le contrôle");

    expect(await db.sessions.count()).toBe(before);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.diaryEntries.count()).toBe(1);
    db.close();
  });
});

describe("clearDiaryEntry", () => {
  it("removes the entry", async () => {
    const db = freshDb("clear");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "à effacer");
    await clearDiaryEntry(db, "c1", day(2026, 8, 1));

    expect(await db.diaryEntries.count()).toBe(0);
    db.close();
  });

  it("normalises the date, so clearing works from any hour of that day", async () => {
    const db = freshDb("clear-hour");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "à effacer");
    await clearDiaryEntry(db, "c1", new Date(2026, 8, 1, 17, 45).getTime());

    expect(await db.diaryEntries.count()).toBe(0);
    db.close();
  });
});

describe("diaryForClass", () => {
  it("returns that class's entries oldest first", async () => {
    const db = freshDb("for-class");
    await setDiaryEntry(db, "c1", day(2026, 8, 10), "plus tard");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "plus tôt");
    await setDiaryEntry(db, "c2", day(2026, 8, 5), "autre classe");

    expect((await diaryForClass(db, "c1")).map((e) => e.text)).toEqual(["plus tôt", "plus tard"]);
    db.close();
  });
});

describe("diaryInRange", () => {
  it("includes both ends of the range and excludes what lies outside", async () => {
    const db = freshDb("range");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "premier");
    await setDiaryEntry(db, "c1", day(2026, 8, 15), "milieu");
    await setDiaryEntry(db, "c1", day(2026, 8, 30), "dernier");
    await setDiaryEntry(db, "c1", day(2026, 9, 1), "hors bornes");

    const found = await diaryInRange(db, day(2026, 8, 1), day(2026, 8, 30));
    expect(found.map((e) => e.text)).toEqual(["premier", "milieu", "dernier"]);
    db.close();
  });

  it("spans every class", async () => {
    const db = freshDb("range-classes");
    await setDiaryEntry(db, "c1", day(2026, 8, 1), "3°B");
    await setDiaryEntry(db, "c2", day(2026, 8, 1), "5°A");

    expect(await diaryInRange(db, day(2026, 8, 1), day(2026, 8, 1))).toHaveLength(2);
    db.close();
  });
});
