import "fake-indexeddb/auto";
import { draftFrom, moveInDraft, removeFromDraft, renameDraft } from "@domain/room-draft";
import { buildRoom } from "@domain/room-templates";
import { type AppDatabase, openWorkspaceDb } from ".";
import { applyPlacement, assignmentsForPlan, getOrCreatePlan } from "./plans";
import { createRoom, desksForRoom, listRooms, saveRoomDraft } from "./rooms";

let db: AppDatabase;

beforeEach(async () => {
  db = openWorkspaceDb(crypto.randomUUID());
  await db.open();
});

afterEach(() => {
  db.close();
});

/** A small salle: one row of three tables de deux, six places. */
const SHAPE = buildRoom({ id: "rows", rows: 1, tables: 3, perTable: 2 });

describe("createRoom", () => {
  it("stamps the shape's positions as desks", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desks = await desksForRoom(db, room.id);
    expect(desks).toHaveLength(6);
    expect(room.width).toBe(SHAPE.width);
    expect(desks.every((d) => d.roomId === room.id)).toBe(true);
  });

  it("gives a second salle its own desks", async () => {
    const a = await createRoom(db, "204", SHAPE);
    const b = await createRoom(db, "Labo", SHAPE);
    expect(await desksForRoom(db, a.id)).toHaveLength(6);
    expect(await desksForRoom(db, b.id)).toHaveLength(6);
    const aIds = (await desksForRoom(db, a.id)).map((d) => d.id);
    const bIds = (await desksForRoom(db, b.id)).map((d) => d.id);
    expect(aIds.some((id) => bIds.includes(id))).toBe(false);
  });
});

describe("listRooms", () => {
  it("sorts by name, accent-insensitively", async () => {
    await createRoom(db, "Labo", SHAPE);
    await createRoom(db, "204", SHAPE);
    await createRoom(db, "Éveil", SHAPE);
    expect((await listRooms(db)).map((r) => r.name)).toEqual(["204", "Éveil", "Labo"]);
  });
});

describe("saveRoomDraft", () => {
  /** Seat `student` at `desk` in a plan for `classId`, and hand back the plan. */
  async function seat(roomId: string, classId: string, deskId: string, studentId: string) {
    const plan = await getOrCreatePlan(db, classId, roomId);
    await applyPlacement(db, plan.id, { kind: "place", studentId, deskId, displaced: null });
    return plan;
  }

  it("writes the name and the floor", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const draft = draftFrom(room, await desksForRoom(db, room.id));

    expect(await saveRoomDraft(db, room.id, { ...renameDraft(draft, "B12"), height: 14 })).toBe(
      true,
    );

    const after = await db.rooms.get(room.id);
    expect(after).toMatchObject({ name: "B12", height: 14 });
  });

  it("trims the name, and refuses a blank one without writing anything", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const draft = draftFrom(room, await desksForRoom(db, room.id));

    expect(await saveRoomDraft(db, room.id, renameDraft(draft, "  B12  "))).toBe(true);
    expect((await db.rooms.get(room.id))?.name).toBe("B12");

    expect(await saveRoomDraft(db, room.id, renameDraft(draft, "   "))).toBe(false);
    expect((await db.rooms.get(room.id))?.name).toBe("B12");
  });

  /**
   * The reason the commit is a diff rather than a delete-and-recreate. An
   * `Assignment` names a desk id, so a table that MOVES has to arrive at its
   * new square as the same row — otherwise rearranging 204 empties the
   * seating plan of every class taught in it.
   */
  it("keeps a moved table's occupants, in every class taught in the salle", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desks = await desksForRoom(db, room.id);
    const a = await seat(room.id, "c1", desks[0].id, "s1");
    const b = await seat(room.id, "c2", desks[0].id, "s9");

    const draft = draftFrom(room, desks);
    const moved = moveInDraft(draft, desks[0].id, { x: 0, y: 4 });
    expect(moved).not.toBeNull();
    expect(moved && (await saveRoomDraft(db, room.id, moved))).toBe(true);

    expect(await db.desks.get(desks[0].id)).toMatchObject({ x: 0, y: 4 });
    expect(await assignmentsForPlan(db, a.id)).toEqual([
      { planId: a.id, deskId: desks[0].id, studentId: "s1" },
    ]);
    expect(await assignmentsForPlan(db, b.id)).toHaveLength(1);
  });

  /**
   * Two tables swapping keeps every id and every square in the room. Written
   * as in-place updates it would abort: `&[roomId+x+y]` admits no two desks on
   * one square, and whichever moved first would land on the other.
   */
  it("survives two tables swapping places", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const [first, second] = await desksForRoom(db, room.id);
    const draft = draftFrom(room, await desksForRoom(db, room.id));
    const swapped = {
      ...draft,
      desks: draft.desks.map((desk) => {
        if (desk.id === first.id) return { ...desk, x: second.x, y: second.y };
        if (desk.id === second.id) return { ...desk, x: first.x, y: first.y };
        return desk;
      }),
    };

    expect(await saveRoomDraft(db, room.id, swapped)).toBe(true);

    expect(await db.desks.get(first.id)).toMatchObject({ x: second.x, y: second.y });
    expect(await db.desks.get(second.id)).toMatchObject({ x: first.x, y: first.y });
    expect(await desksForRoom(db, room.id)).toHaveLength(6);
  });

  it("takes a removed table's assignments with it, across every class", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desks = await desksForRoom(db, room.id);
    const a = await seat(room.id, "c1", desks[0].id, "s1");
    const b = await seat(room.id, "c2", desks[0].id, "s9");

    const draft = draftFrom(room, desks);
    expect(await saveRoomDraft(db, room.id, removeFromDraft(draft, desks[0].id))).toBe(true);

    expect(await desksForRoom(db, room.id)).toHaveLength(5);
    expect(await assignmentsForPlan(db, a.id)).toEqual([]);
    expect(await assignmentsForPlan(db, b.id)).toEqual([]);
  });

  it("adds a table the teacher put down", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const draft = draftFrom(room, await desksForRoom(db, room.id));
    const added = { ...draft, desks: [...draft.desks, { id: "new", x: 0, y: 4 }] };

    expect(await saveRoomDraft(db, room.id, added)).toBe(true);

    expect(await desksForRoom(db, room.id)).toHaveLength(7);
    expect(await db.desks.get("new")).toMatchObject({ roomId: room.id, x: 0, y: 4 });
  });

  /**
   * Refused WHOLE, and before anything is written: a half-saved room — the new
   * name kept, the tables not — is worse than a rejected one.
   */
  it("refuses a draft whose tables overlap, and writes nothing at all", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desks = await desksForRoom(db, room.id);
    const draft = draftFrom(room, desks);
    const overlapping = {
      ...renameDraft(draft, "B12"),
      desks: draft.desks.map((desk) =>
        desk.id === desks[1].id ? { ...desk, x: desks[0].x + 1, y: desks[0].y } : desk,
      ),
    };

    expect(await saveRoomDraft(db, room.id, overlapping)).toBe(false);

    expect((await db.rooms.get(room.id))?.name).toBe("204");
    expect(await db.desks.get(desks[1].id)).toMatchObject({ x: desks[1].x, y: desks[1].y });
  });

  it("refuses a draft whose tables sit outside the floor", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const draft = draftFrom(room, await desksForRoom(db, room.id));

    expect(await saveRoomDraft(db, room.id, { ...draft, width: 4, height: 4 })).toBe(false);
  });

  it("refuses a salle that no longer exists", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const draft = draftFrom(room, await desksForRoom(db, room.id));
    await db.rooms.delete(room.id);

    expect(await saveRoomDraft(db, room.id, draft)).toBe(false);
  });
});
