import "fake-indexeddb/auto";
import { TABLE } from "@domain/room";
import { buildRoom } from "@domain/room-templates";
import { type AppDatabase, openWorkspaceDb } from ".";
import { applyPlacement, assignmentsForPlan, getOrCreatePlan } from "./plans";
import {
  addDesk,
  applyShape,
  createRoom,
  desksForRoom,
  listRooms,
  moveDesk,
  nudgeDesk,
  removeDesk,
  renameRoom,
  stampOverflow,
} from "./rooms";

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

describe("renameRoom", () => {
  it("renames without disturbing the furniture", async () => {
    const room = await createRoom(db, "204", SHAPE);
    await renameRoom(db, room.id, "Salle 204");
    expect((await db.rooms.get(room.id))?.name).toBe("Salle 204");
    expect(await desksForRoom(db, room.id)).toHaveLength(6);
  });
});

describe("addDesk", () => {
  it("places a desk on free floor", async () => {
    const room = await createRoom(db, "204", SHAPE);
    expect(await addDesk(db, room.id, { x: 0, y: 0 })).toBe(true);
    expect(await desksForRoom(db, room.id)).toHaveLength(7);
  });

  it("refuses a position that overlaps an existing desk", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const first = (await desksForRoom(db, room.id))[0];
    expect(await addDesk(db, room.id, { x: first.x, y: first.y })).toBe(false);
    expect(await desksForRoom(db, room.id)).toHaveLength(6);
  });

  it("allows a position exactly TABLE away — adjacency is legal, and merges", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const first = (await desksForRoom(db, room.id))[0];
    expect(await addDesk(db, room.id, { x: first.x, y: first.y + TABLE })).toBe(true);
  });

  it("refuses a position outside the room", async () => {
    const room = await createRoom(db, "204", SHAPE);
    expect(await addDesk(db, room.id, { x: room.width, y: 0 })).toBe(false);
  });
});

describe("moveDesk", () => {
  it("moves onto free floor", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desk = (await desksForRoom(db, room.id))[0];
    expect(await moveDesk(db, desk.id, { x: 0, y: 0 })).toBe(true);
    expect((await db.desks.get(desk.id))?.x).toBe(0);
  });

  it("refuses a move onto a neighbour", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const [a, b] = await desksForRoom(db, room.id);
    expect(await moveDesk(db, a.id, { x: b.x, y: b.y })).toBe(false);
    expect((await db.desks.get(a.id))?.x).toBe(a.x);
  });

  it("lets a desk move onto the square it already occupies", async () => {
    // It excludes itself from the collision set, or its own square would be
    // the one place it could never go.
    const room = await createRoom(db, "204", SHAPE);
    const desk = (await desksForRoom(db, room.id))[0];
    expect(await moveDesk(db, desk.id, { x: desk.x, y: desk.y })).toBe(true);
  });

  it("keeps the pupil sitting at it", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const plan = await getOrCreatePlan(db, "c1", room.id);
    const desk = (await desksForRoom(db, room.id))[0];
    await applyPlacement(db, plan.id, {
      kind: "place",
      studentId: "s1",
      deskId: desk.id,
      displaced: null,
    });
    await moveDesk(db, desk.id, { x: 0, y: 0 });
    expect((await assignmentsForPlan(db, plan.id))[0]).toMatchObject({
      deskId: desk.id,
      studentId: "s1",
    });
  });
});

describe("nudgeDesk", () => {
  it("walks a desk one unit at a time", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desk = (await desksForRoom(db, room.id))[0];
    await nudgeDesk(db, desk.id, { x: 0, y: 1 });
    await nudgeDesk(db, desk.id, { x: 0, y: 1 });
    expect((await db.desks.get(desk.id))?.y).toBe(desk.y + 2);
  });

  it("refuses a nudge into a wall, writing nothing", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const desk = (await desksForRoom(db, room.id))[0];
    await moveDesk(db, desk.id, { x: 0, y: 0 });
    expect(await nudgeDesk(db, desk.id, { x: -1, y: 0 })).toBe(false);
    expect((await db.desks.get(desk.id))?.x).toBe(0);
  });
});

describe("removeDesk", () => {
  it("takes the desk and every assignment naming it, across every class", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const a = await getOrCreatePlan(db, "c1", room.id);
    const b = await getOrCreatePlan(db, "c2", room.id);
    const desk = (await desksForRoom(db, room.id))[0];
    for (const [plan, student] of [
      [a, "s1"],
      [b, "s9"],
    ] as const) {
      await applyPlacement(db, plan.id, {
        kind: "place",
        studentId: student,
        deskId: desk.id,
        displaced: null,
      });
    }

    await removeDesk(db, desk.id);

    expect(await desksForRoom(db, room.id)).toHaveLength(5);
    expect(await assignmentsForPlan(db, a.id)).toEqual([]);
    expect(await assignmentsForPlan(db, b.id)).toEqual([]);
  });
});

describe("applyShape", () => {
  it("replaces every desk", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const before = (await desksForRoom(db, room.id)).map((d) => d.id);
    await applyShape(db, room.id, buildRoom({ id: "rows", rows: 2, tables: 2, perTable: 2 }));
    const after = await desksForRoom(db, room.id);
    expect(after).toHaveLength(8);
    expect(after.some((d) => before.includes(d.id))).toBe(false);
  });

  it("pours each plan's pupils into the new positions in reading order", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const plan = await getOrCreatePlan(db, "c1", room.id);
    const desks = await desksForRoom(db, room.id);
    for (const [i, student] of ["s1", "s2", "s3"].entries()) {
      await applyPlacement(db, plan.id, {
        kind: "place",
        studentId: student,
        deskId: desks[i].id,
        displaced: null,
      });
    }

    await applyShape(db, room.id, buildRoom({ id: "rows", rows: 2, tables: 2, perTable: 2 }));

    const newDesks = await desksForRoom(db, room.id);
    const byDesk = new Map(
      (await assignmentsForPlan(db, plan.id)).map((a) => [a.deskId, a.studentId]),
    );
    expect(newDesks.slice(0, 3).map((d) => byDesk.get(d.id))).toEqual(["s1", "s2", "s3"]);
  });

  it("reseats every class taught in the salle, not just one", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const a = await getOrCreatePlan(db, "c1", room.id);
    const b = await getOrCreatePlan(db, "c2", room.id);
    const desks = await desksForRoom(db, room.id);
    await applyPlacement(db, a.id, {
      kind: "place",
      studentId: "s1",
      deskId: desks[0].id,
      displaced: null,
    });
    await applyPlacement(db, b.id, {
      kind: "place",
      studentId: "s9",
      deskId: desks[0].id,
      displaced: null,
    });

    await applyShape(db, room.id, buildRoom({ id: "rows", rows: 2, tables: 2, perTable: 2 }));

    expect((await assignmentsForPlan(db, a.id)).map((x) => x.studentId)).toEqual(["s1"]);
    expect((await assignmentsForPlan(db, b.id)).map((x) => x.studentId)).toEqual(["s9"]);
  });

  it("returns whoever no longer fits rather than dropping them", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const plan = await getOrCreatePlan(db, "c1", room.id);
    const desks = await desksForRoom(db, room.id);
    for (const [i, student] of ["s1", "s2", "s3"].entries()) {
      await applyPlacement(db, plan.id, {
        kind: "place",
        studentId: student,
        deskId: desks[i].id,
        displaced: null,
      });
    }

    const { overflow } = await applyShape(
      db,
      room.id,
      buildRoom({ id: "rows", rows: 1, tables: 1, perTable: 1 }),
    );

    expect(overflow[plan.id]).toEqual(["s2", "s3"]);
    expect(await assignmentsForPlan(db, plan.id)).toHaveLength(1);
  });

  it("reports no overflow when everyone fits", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const plan = await getOrCreatePlan(db, "c1", room.id);
    const desks = await desksForRoom(db, room.id);
    await applyPlacement(db, plan.id, {
      kind: "place",
      studentId: "s1",
      deskId: desks[0].id,
      displaced: null,
    });
    const { overflow } = await applyShape(db, room.id, SHAPE);
    expect(overflow).toEqual({});
  });
});

describe("stampOverflow", () => {
  it("counts the loss before the write, per plan", async () => {
    const room = await createRoom(db, "204", SHAPE);
    const plan = await getOrCreatePlan(db, "c1", room.id);
    const desks = await desksForRoom(db, room.id);
    for (const [i, student] of ["s1", "s2", "s3"].entries()) {
      await applyPlacement(db, plan.id, {
        kind: "place",
        studentId: student,
        deskId: desks[i].id,
        displaced: null,
      });
    }

    const overflow = await stampOverflow(
      db,
      room.id,
      buildRoom({ id: "rows", rows: 1, tables: 1, perTable: 1 }),
    );

    expect(overflow[plan.id]).toEqual(["s2", "s3"]);
    // And nothing was written: the warning must precede the destruction.
    expect(await assignmentsForPlan(db, plan.id)).toHaveLength(3);
    expect(await desksForRoom(db, room.id)).toHaveLength(6);
  });
});
