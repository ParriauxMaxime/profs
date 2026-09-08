import {
  addToDraft,
  draftChanged,
  draftFrom,
  moveInDraft,
  nudgeInDraft,
  type RoomDraft,
  removeFromDraft,
  renameDraft,
  resizeDraft,
} from "./room-draft";

const room = { name: "204", width: 12, height: 10 };

/** Two tables of two, side by side at the front, with an aisle between. */
function draft(): RoomDraft {
  return draftFrom(room, [
    { id: "a", x: 2, y: 2 },
    { id: "b", x: 4, y: 2 },
    { id: "c", x: 8, y: 2 },
  ]);
}

describe("draftFrom", () => {
  it("copies the salle as it stands", () => {
    expect(draft()).toEqual({
      name: "204",
      width: 12,
      height: 10,
      desks: [
        { id: "a", x: 2, y: 2 },
        { id: "b", x: 4, y: 2 },
        { id: "c", x: 8, y: 2 },
      ],
    });
  });

  it("keeps only what a place IS, so a desk row's other fields cannot leak into a comparison", () => {
    const stored = { id: "a", roomId: "r1", x: 2, y: 2 };
    const seeded = draftFrom(room, [stored]);
    expect(seeded.desks[0]).toEqual({ id: "a", x: 2, y: 2 });
  });
});

describe("draftChanged", () => {
  it("is false for a draft nobody has touched", () => {
    expect(draftChanged(draft(), draft())).toBe(false);
  });

  it("sees a rename", () => {
    expect(draftChanged(draft(), renameDraft(draft(), "B12"))).toBe(true);
  });

  it("sees a resize", () => {
    expect(draftChanged(draft(), resizeDraft(draft(), { width: 14, height: 10 }))).toBe(true);
  });

  it("sees a table move, an addition and a removal", () => {
    const moved = moveInDraft(draft(), "a", { x: 2, y: 6 });
    const added = addToDraft(draft(), { x: 8, y: 6 }, "d");
    expect(moved && draftChanged(draft(), moved)).toBe(true);
    expect(added && draftChanged(draft(), added)).toBe(true);
    expect(draftChanged(draft(), removeFromDraft(draft(), "a"))).toBe(true);
  });

  /**
   * The button says "there is something to save", not "you touched something".
   * A teacher who picks a table up and puts it back has nothing to save, and
   * enabling Save would invite a write that changes nothing.
   */
  it("is false again once a table is moved back", () => {
    const there = moveInDraft(draft(), "a", { x: 2, y: 6 });
    const back = there && moveInDraft(there, "a", { x: 2, y: 2 });
    expect(back && draftChanged(draft(), back)).toBe(false);
  });

  it("ignores the order desks arrive in", () => {
    const reversed = { ...draft(), desks: [...draft().desks].reverse() };
    expect(draftChanged(draft(), reversed)).toBe(false);
  });

  /**
   * Two desks swapping positions keeps every id and every coordinate — only
   * the pairing changes. Comparing sorted coordinates would call that
   * unchanged, and the swap would be silently unsavable.
   */
  it("sees two tables swapping places", () => {
    const swapped = {
      ...draft(),
      desks: [
        { id: "a", x: 4, y: 2 },
        { id: "b", x: 2, y: 2 },
        { id: "c", x: 8, y: 2 },
      ],
    };
    expect(draftChanged(draft(), swapped)).toBe(true);
  });
});

describe("addToDraft", () => {
  it("puts a table down on free floor", () => {
    const next = addToDraft(draft(), { x: 8, y: 6 }, "d");
    expect(next?.desks).toContainEqual({ id: "d", x: 8, y: 6 });
  });

  it("refuses a table that would overlap a neighbour", () => {
    expect(addToDraft(draft(), { x: 3, y: 2 }, "d")).toBeNull();
  });

  it("allows a table flush against its neighbour, which is what makes a table de deux", () => {
    expect(addToDraft(draft(), { x: 6, y: 2 }, "d")).not.toBeNull();
  });

  it("refuses a table past the wall", () => {
    expect(addToDraft(draft(), { x: 11, y: 2 }, "d")).toBeNull();
  });
});

describe("moveInDraft", () => {
  it("moves a table to free floor", () => {
    expect(moveInDraft(draft(), "a", { x: 2, y: 6 })?.desks).toContainEqual({
      id: "a",
      x: 2,
      y: 6,
    });
  });

  /**
   * A moving table excludes ITSELF from the collision set, or the square it
   * already occupies is the one place it could never move to.
   */
  it("lets a table stay where it is", () => {
    expect(moveInDraft(draft(), "a", { x: 2, y: 2 })).not.toBeNull();
  });

  it("refuses a move onto a neighbour", () => {
    expect(moveInDraft(draft(), "a", { x: 4, y: 2 })).toBeNull();
  });

  it("refuses a table nobody has", () => {
    expect(moveInDraft(draft(), "nope", { x: 2, y: 6 })).toBeNull();
  });
});

describe("nudgeInDraft", () => {
  it("walks a table one half-tile at a time, which is the only way to reach an arc's coordinates", () => {
    expect(nudgeInDraft(draft(), "c", { x: 0, y: 1 })?.desks).toContainEqual({
      id: "c",
      x: 8,
      y: 3,
    });
  });

  it("refuses a nudge into a neighbour", () => {
    expect(nudgeInDraft(draft(), "a", { x: 1, y: 0 })).toBeNull();
  });

  it("refuses a nudge through the wall", () => {
    const againstTheWall = draftFrom(room, [{ id: "a", x: 0, y: 0 }]);
    expect(nudgeInDraft(againstTheWall, "a", { x: 0, y: -1 })).toBeNull();
    expect(nudgeInDraft(againstTheWall, "a", { x: -1, y: 0 })).toBeNull();
  });
});

describe("removeFromDraft", () => {
  it("takes the table out", () => {
    expect(removeFromDraft(draft(), "a").desks.map((d) => d.id)).toEqual(["b", "c"]);
  });

  it("leaves a draft alone when the table is not in it", () => {
    expect(removeFromDraft(draft(), "nope")).toEqual(draft());
  });
});

describe("resizeDraft", () => {
  it("grows the floor", () => {
    expect(resizeDraft(draft(), { width: 16, height: 12 })).toMatchObject({
      width: 16,
      height: 12,
    });
  });

  /**
   * The floor can never shrink under the furniture: a table outside the walls
   * fails `canPlace`, so every attempt to bring it back would be refused and
   * the teacher would have a table they can see and cannot touch.
   */
  it("will not shrink under the tables", () => {
    const shrunk = resizeDraft(draft(), { width: 2, height: 2 });
    expect(shrunk.width).toBeGreaterThanOrEqual(10);
    expect(shrunk.height).toBeGreaterThanOrEqual(4);
  });
});

describe("renameDraft", () => {
  it("renames", () => {
    expect(renameDraft(draft(), "B12").name).toBe("B12");
  });
});
