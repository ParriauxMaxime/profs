import "fake-indexeddb/auto";
import { buildRoom } from "@domain/room-templates";
import { openWorkspaceDb } from ".";
import { deleteRoom, listRooms, renameRoom, roomShape, saveRoom } from "./rooms";
import { applyTemplate, getOrCreateLayout, seatStudent, seatsForLayout } from "./seating";

function freshDb(name: string) {
  return openWorkspaceDb(`${name}-${crypto.randomUUID()}`);
}

const shape = () => buildRoom({ id: "islands", islands: 3, perIsland: 4 });

describe("saveRoom", () => {
  it("keeps the shape and none of the pupils", async () => {
    // A saved room is stamped onto other classes, where these pupil ids do not
    // exist. Storing an occupant would be storing a dangling reference.
    const db = freshDb("rooms");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    await seatStudent(db, seats[0].id, "s1");

    const built = shape();
    const room = await saveRoom(db, "Salle 204", built);

    expect(room.name).toBe("Salle 204");
    expect(room.width).toBe(built.width);
    expect(room.positions).toHaveLength(built.positions.length);
    expect(JSON.stringify(room)).not.toContain("s1");
    db.close();
  });

  it("gives each saved room its own id, so two saves are two rooms", async () => {
    const db = freshDb("rooms");
    const a = await saveRoom(db, "Salle 204", shape());
    const b = await saveRoom(db, "Salle 204", shape());
    expect(a.id).not.toBe(b.id);
    expect(await listRooms(db)).toHaveLength(2);
    db.close();
  });
});

describe("listRooms", () => {
  it("sorts by name, accent- and case-insensitively", async () => {
    const db = freshDb("rooms");
    await saveRoom(db, "salle b", shape());
    await saveRoom(db, "Salle A", shape());
    await saveRoom(db, "Élan", shape());
    expect((await listRooms(db)).map((r) => r.name)).toEqual(["Élan", "Salle A", "salle b"]);
    db.close();
  });

  it("is empty before anything is saved", async () => {
    const db = freshDb("rooms");
    expect(await listRooms(db)).toEqual([]);
    db.close();
  });
});

describe("renameRoom / deleteRoom", () => {
  it("renames without touching the shape", async () => {
    const db = freshDb("rooms");
    const room = await saveRoom(db, "Salle 204", shape());
    await renameRoom(db, room.id, "Salle 12");
    const [stored] = await listRooms(db);
    expect(stored.name).toBe("Salle 12");
    expect(stored.positions).toHaveLength(room.positions.length);
    db.close();
  });

  it("deletes one and leaves the others", async () => {
    const db = freshDb("rooms");
    const a = await saveRoom(db, "Salle A", shape());
    await saveRoom(db, "Salle B", shape());
    await deleteRoom(db, a.id);
    expect((await listRooms(db)).map((r) => r.name)).toEqual(["Salle B"]);
    db.close();
  });
});

describe("a saved room stamps like a template", () => {
  it("re-seats the pupils it can and reports the rest as overflow", async () => {
    // The whole reason a saved room needed no new occupant rule: it goes
    // through applyTemplate, which already answers this.
    const db = freshDb("rooms");
    const layout = await getOrCreateLayout(db, "c1");
    const seats = await seatsForLayout(db, layout.id);
    for (const [i, seat] of seats.slice(0, 8).entries()) {
      await seatStudent(db, seat.id, `s${i}`);
    }

    const small = await saveRoom(
      db,
      "Petite salle",
      buildRoom({ id: "rows", rows: 2, tables: 1, perTable: 2 }),
    );
    const { overflow } = await applyTemplate(db, layout.id, roomShape(small));

    const after = await seatsForLayout(db, layout.id);
    expect(after).toHaveLength(4);
    // Four seats for eight pupils: four sit, four come back to the rail.
    expect(after.filter((s) => s.studentId !== null)).toHaveLength(4);
    expect(overflow).toHaveLength(4);
    db.close();
  });

  it("leaves nothing on the layout pointing back at the saved room", async () => {
    // A stamp CEASES TO EXIST. Editing "Salle 204" later must not reach a class
    // already stamped from it, so the layout records no origin.
    const db = freshDb("rooms");
    const layout = await getOrCreateLayout(db, "c1");
    const room = await saveRoom(db, "Salle 204", shape());
    await applyTemplate(db, layout.id, roomShape(room));

    const stored = await db.seatingLayouts.get(layout.id);
    expect(JSON.stringify(stored)).not.toContain(room.id);
    db.close();
  });

  it("survives the saved room being deleted afterwards", async () => {
    const db = freshDb("rooms");
    const layout = await getOrCreateLayout(db, "c1");
    const room = await saveRoom(db, "Salle 204", shape());
    await applyTemplate(db, layout.id, roomShape(room));
    const before = (await seatsForLayout(db, layout.id)).length;

    await deleteRoom(db, room.id);

    expect(await seatsForLayout(db, layout.id)).toHaveLength(before);
    db.close();
  });
});
