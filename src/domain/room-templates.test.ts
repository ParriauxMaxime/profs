import { MAX_POSITIONS, overlaps, PITCH, ROOM_MAX, TABLE } from "./room";
import {
  buildRoom,
  clampTemplate,
  DEFAULT_TEMPLATE,
  defaultTemplate,
  type RoomTemplate,
  seatCount,
  TEMPLATE_IDS,
} from "./room-templates";

/** Shared by every generator's test: the shape must be a room, not a pile. */
function expectWellFormed(template: RoomTemplate): void {
  const shape = buildRoom(template);
  expect(shape.positions).toHaveLength(seatCount(template));
  expect(shape.width).toBeLessThanOrEqual(ROOM_MAX);
  expect(shape.height).toBeLessThanOrEqual(ROOM_MAX);
  for (const p of shape.positions) {
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + TABLE).toBeLessThanOrEqual(shape.width);
    expect(p.y + TABLE).toBeLessThanOrEqual(shape.height);
  }
  for (let i = 0; i < shape.positions.length; i += 1) {
    for (let j = i + 1; j < shape.positions.length; j += 1) {
      expect(overlaps(shape.positions[i], shape.positions[j])).toBe(false);
    }
  }
}

describe("the registry", () => {
  it("names four templates and gives each a default", () => {
    expect(TEMPLATE_IDS).toEqual(["rows", "arc", "islands", "u"]);
    for (const id of TEMPLATE_IDS) {
      expect(defaultTemplate(id).id).toBe(id);
    }
  });

  it("defaults to the grid phase 5 shipped", () => {
    expect(DEFAULT_TEMPLATE).toEqual({ id: "rows", rows: 5, cols: 6 });
  });

  it("builds a well-formed room from every default", () => {
    // Widened to every id in Task 4, once all four generators exist.
    expectWellFormed(defaultTemplate("rows"));
  });
});

describe("clampTemplate", () => {
  it("raises a parameter below its floor", () => {
    expect(clampTemplate({ id: "rows", rows: 0, cols: 0 })).toEqual({
      id: "rows",
      rows: 1,
      cols: 1,
    });
  });

  it("lowers a parameter above its ceiling", () => {
    expect(clampTemplate({ id: "rows", rows: 99, cols: 99 })).toMatchObject({
      rows: expect.any(Number),
      cols: 20,
    });
  });

  it("rounds a fractional parameter to an integer", () => {
    expect(clampTemplate({ id: "rows", rows: 3.7, cols: 2.2 })).toEqual({
      id: "rows",
      rows: 4,
      cols: 2,
    });
  });

  it("keeps the seat total within a class's ceiling", () => {
    for (const id of TEMPLATE_IDS) {
      const clamped = clampTemplate(defaultTemplate(id));
      expect(seatCount(clamped)).toBeLessThanOrEqual(MAX_POSITIONS);
    }
    const huge = clampTemplate({ id: "rows", rows: 20, cols: 20 });
    expect(seatCount(huge)).toBeLessThanOrEqual(MAX_POSITIONS);
  });

  it("is idempotent", () => {
    const once = clampTemplate({ id: "rows", rows: 40, cols: 40 });
    expect(clampTemplate(once)).toEqual(once);
  });
});

describe("rows", () => {
  it("lays a grid out at pitch", () => {
    const shape = buildRoom({ id: "rows", rows: 2, cols: 3 });
    expect(shape.positions).toEqual([
      { x: 1, y: 1 },
      { x: 1 + PITCH, y: 1 },
      { x: 1 + 2 * PITCH, y: 1 },
      { x: 1, y: 1 + PITCH },
      { x: 1 + PITCH, y: 1 + PITCH },
      { x: 1 + 2 * PITCH, y: 1 + PITCH },
    ]);
  });

  it("is well formed across its whole parameter range", () => {
    for (let rows = 1; rows <= 20; rows += 1) {
      for (let cols = 1; cols <= 20; cols += 1) {
        expectWellFormed(clampTemplate({ id: "rows", rows, cols }));
      }
    }
  });
});

describe("arc", () => {
  it("curves: the ends of a row sit closer to the board than its middle", () => {
    const shape = buildRoom({ id: "arc", perRow: 9, rows: 1, curve: 5 });
    const ys = shape.positions.map((p) => p.y);
    const middle = ys[Math.floor(ys.length / 2)];
    expect(ys[0]).toBeLessThan(middle);
    expect(ys[ys.length - 1]).toBeLessThan(middle);
  });

  it("is symmetric about the middle of the row", () => {
    const shape = buildRoom({ id: "arc", perRow: 9, rows: 1, curve: 4 });
    const ys = shape.positions.map((p) => p.y);
    for (let i = 0; i < ys.length; i += 1) {
      expect(ys[i]).toBe(ys[ys.length - 1 - i]);
    }
  });

  it("puts the back row further from the board than the front", () => {
    const shape = buildRoom({ id: "arc", perRow: 6, rows: 3, curve: 3 });
    const rowStarts = [0, 6, 12].map((i) => shape.positions[i].y);
    expect(rowStarts[0]).toBeLessThan(rowStarts[1]);
    expect(rowStarts[1]).toBeLessThan(rowStarts[2]);
  });

  it("emits positions in reading order", () => {
    const shape = buildRoom({ id: "arc", perRow: 5, rows: 2, curve: 3 });
    const front = shape.positions.slice(0, 5);
    expect([...front].sort((a, b) => a.x - b.x)).toEqual(front);
  });

  it("is well formed across its ENTIRE parameter range, not a sample", () => {
    for (let perRow = 1; perRow <= 20; perRow += 1) {
      for (let rows = 1; rows <= 4; rows += 1) {
        for (let curve = 1; curve <= 5; curve += 1) {
          expectWellFormed(clampTemplate({ id: "arc", perRow, rows, curve }));
        }
      }
    }
  });

  it("is wider when the curve is shallow — which is why ROOM_MAX is 120", () => {
    const shallow = buildRoom({ id: "arc", perRow: 20, rows: 1, curve: 1 });
    const deep = buildRoom({ id: "arc", perRow: 20, rows: 1, curve: 5 });
    expect(shallow.width).toBeGreaterThan(deep.width);
  });
});
