import { MAX_POSITIONS, overlaps, type Position, ROOM_MAX, TABLE, tableGroups } from "./room";
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

  it("defaults to four rows of three tables de deux", () => {
    expect(DEFAULT_TEMPLATE).toEqual({ id: "rows", rows: 4, tables: 3, perTable: 2 });
    expect(seatCount(DEFAULT_TEMPLATE)).toBe(24);
  });

  it("builds a well-formed room from every default", () => {
    for (const id of TEMPLATE_IDS) expectWellFormed(defaultTemplate(id));
  });
});

describe("clampTemplate", () => {
  it("raises a parameter below its floor", () => {
    expect(clampTemplate({ id: "rows", rows: 0, tables: 0, perTable: 0 })).toEqual({
      id: "rows",
      rows: 1,
      tables: 1,
      perTable: 1,
    });
  });

  it("lowers a parameter above its ceiling", () => {
    expect(clampTemplate({ id: "rows", rows: 99, tables: 99, perTable: 99 })).toMatchObject({
      rows: expect.any(Number),
      tables: 10,
      perTable: 4,
    });
  });

  it("rounds a fractional parameter to an integer", () => {
    expect(clampTemplate({ id: "rows", rows: 3.7, tables: 2.2, perTable: 1.6 })).toEqual({
      id: "rows",
      rows: 4,
      tables: 2,
      perTable: 2,
    });
  });

  it("keeps the seat total within a class's ceiling", () => {
    for (const id of TEMPLATE_IDS) {
      const clamped = clampTemplate(defaultTemplate(id));
      expect(seatCount(clamped)).toBeLessThanOrEqual(MAX_POSITIONS);
    }
    const huge = clampTemplate({ id: "rows", rows: 20, tables: 12, perTable: 4 });
    expect(seatCount(huge)).toBeLessThanOrEqual(MAX_POSITIONS);
  });

  it("is idempotent", () => {
    const once = clampTemplate({ id: "rows", rows: 40, tables: 40, perTable: 9 });
    expect(clampTemplate(once)).toEqual(once);
  });
});

/** The positions as `tableGroups` sees them, so a test can count TABLES. */
function groupsOf(shape: { positions: Position[] }) {
  return tableGroups(shape.positions.map((p, i) => ({ id: String(i), ...p, studentId: null })));
}

describe("rows", () => {
  it("puts the places of one table edge to edge, so they draw as one surface", () => {
    const shape = buildRoom({ id: "rows", rows: 1, tables: 1, perTable: 2 });
    const groups = groupsOf(shape);
    expect(groups).toHaveLength(1);
    expect(groups[0].desks).toHaveLength(2);
    expect(groups[0].width).toBe(2 * TABLE);
  });

  it("leaves an aisle between tables in the same row", () => {
    const shape = buildRoom({ id: "rows", rows: 1, tables: 3, perTable: 2 });
    expect(shape.positions).toHaveLength(6);
    expect(groupsOf(shape)).toHaveLength(3);
  });

  it("keeps rows apart", () => {
    const shape = buildRoom({ id: "rows", rows: 2, tables: 1, perTable: 2 });
    expect(groupsOf(shape)).toHaveLength(2);
  });

  it("counts places, not tables", () => {
    expect(seatCount({ id: "rows", rows: 4, tables: 3, perTable: 2 })).toBe(24);
  });

  it("degrades to single desks at one place per table", () => {
    const shape = buildRoom({ id: "rows", rows: 1, tables: 3, perTable: 1 });
    expect(groupsOf(shape)).toHaveLength(3);
  });

  it("is well formed across its whole parameter range", () => {
    for (let rows = 1; rows <= 20; rows += 1) {
      for (let tables = 1; tables <= 10; tables += 1) {
        for (let perTable = 1; perTable <= 4; perTable += 1) {
          expectWellFormed(clampTemplate({ id: "rows", rows, tables, perTable }));
        }
      }
    }
  });
});

describe("islands are actually islands", () => {
  it("makes one block per island rather than spaced desks", () => {
    const groups = groupsOf(buildRoom({ id: "islands", islands: 2, perIsland: 4 }));
    expect(groups).toHaveLength(2);
    expect(groups[0].desks).toHaveLength(4);
    expect(groups[0]).toMatchObject({ width: 2 * TABLE, height: 2 * TABLE });
  });
});

describe("the horseshoe is continuous", () => {
  it("is one table, not a ring of separate desks", () => {
    expect(groupsOf(buildRoom({ id: "u", cols: 4, rows: 3 }))).toHaveLength(1);
  });

  it("degrades to a plain row at one row", () => {
    expect(groupsOf(buildRoom({ id: "u", cols: 4, rows: 1 }))).toHaveLength(1);
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

  it("is no wider than the straight row of the same length", () => {
    // The old arc derived its radius from an angular span, so ten seats came
    // out ~44 units across at EVERY curvature — a flat line stretched over
    // 1600px. Width is now fixed by the seat spacing, and only the depth moves.
    const straight = buildRoom({ id: "rows", rows: 1, tables: 10, perTable: 1 });
    for (const curve of [1, 3, 5]) {
      const arc = buildRoom({ id: "arc", perRow: 10, rows: 1, curve });
      expect(arc.width).toBeLessThanOrEqual(straight.width);
    }
  });

  it("bows deeper as the curve rises, and only deeper", () => {
    const shallow = buildRoom({ id: "arc", perRow: 10, rows: 1, curve: 1 });
    const deep = buildRoom({ id: "arc", perRow: 10, rows: 1, curve: 5 });
    expect(deep.height).toBeGreaterThan(shallow.height);
    expect(deep.width).toBe(shallow.width);
  });
});

describe("islands", () => {
  it("clusters tables two wide", () => {
    const shape = buildRoom({ id: "islands", islands: 1, perIsland: 4 });
    const xs = new Set(shape.positions.map((p) => p.x));
    expect(xs.size).toBe(2);
  });

  it("puts an odd table alone on the last row of its island", () => {
    const shape = buildRoom({ id: "islands", islands: 1, perIsland: 5 });
    expect(shape.positions).toHaveLength(5);
    const lastRowY = Math.max(...shape.positions.map((p) => p.y));
    expect(shape.positions.filter((p) => p.y === lastRowY)).toHaveLength(1);
  });

  it("separates two islands by more than it separates tables inside one", () => {
    const shape = buildRoom({ id: "islands", islands: 2, perIsland: 2 });
    const xs = [...new Set(shape.positions.map((p) => p.x))].sort((a, b) => a - b);
    expect(xs).toHaveLength(4);
    expect(xs[2] - xs[1]).toBeGreaterThan(xs[1] - xs[0]);
  });

  it("is well formed across its entire parameter range", () => {
    for (let islands = 1; islands <= 12; islands += 1) {
      for (let perIsland = 2; perIsland <= 8; perIsland += 1) {
        expectWellFormed(clampTemplate({ id: "islands", islands, perIsland }));
      }
    }
  });
});

describe("u", () => {
  it("opens toward the board: the arms run up, the closed side is at the bottom", () => {
    const shape = buildRoom({ id: "u", cols: 5, rows: 3 });
    const maxY = Math.max(...shape.positions.map((p) => p.y));
    // The back row is full width.
    expect(shape.positions.filter((p) => p.y === maxY)).toHaveLength(5);
    // The row nearest the board holds only the two arm ends.
    const minY = Math.min(...shape.positions.map((p) => p.y));
    expect(shape.positions.filter((p) => p.y === minY)).toHaveLength(2);
  });

  it("counts cols + 2 * (rows - 1) seats", () => {
    expect(buildRoom({ id: "u", cols: 8, rows: 4 }).positions).toHaveLength(
      seatCount({ id: "u", cols: 8, rows: 4 }),
    );
  });

  it("degrades to a single row when there is only one row", () => {
    const shape = buildRoom({ id: "u", cols: 6, rows: 1 });
    expect(shape.positions).toHaveLength(6);
    expect(new Set(shape.positions.map((p) => p.y)).size).toBe(1);
  });

  it("is well formed across its entire parameter range", () => {
    for (let cols = 2; cols <= 20; cols += 1) {
      for (let rows = 1; rows <= 10; rows += 1) {
        expectWellFormed(clampTemplate({ id: "u", cols, rows }));
      }
    }
  });
});
