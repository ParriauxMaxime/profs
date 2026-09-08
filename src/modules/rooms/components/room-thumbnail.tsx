import { type RoomShape, TABLE } from "@domain/room";

/**
 * A salle at a glance: its floor, its board, and one rect per table.
 *
 * Takes a `RoomShape`, which is what both things it draws already are — a
 * preset is `buildRoom(template)`, and an existing salle is its own row's
 * extent plus its desks. One component for both is the point: a card cannot
 * promise îlots and then open onto rows, and a hand-drawn icon would drift the
 * first time a generator changed.
 *
 * The floor is drawn at the room's OWN scaled extent rather than filling the
 * box, so a wide salle and a deep one read as different rooms instead of as
 * the same rectangle with the tables moved.
 */
export function RoomThumbnail({
  shape,
  boxW = 120,
  boxH = 56,
}: {
  shape: RoomShape;
  boxW?: number;
  boxH?: number;
}) {
  const scale = Math.min(boxW / shape.width, boxH / shape.height);
  const floorW = shape.width * scale;
  const floorH = shape.height * scale;
  const left = (boxW - floorW) / 2;
  const top = (boxH - floorH) / 2;

  return (
    <svg
      viewBox={`0 0 ${boxW} ${boxH}`}
      style={{ width: "100%", height: "auto" }}
      aria-hidden="true"
    >
      <rect
        x={left.toFixed(2)}
        y={top.toFixed(2)}
        width={floorW.toFixed(2)}
        height={floorH.toFixed(2)}
        rx={3}
        fill="var(--floor)"
      />
      {/* The board, so an arc and a horseshoe read as facing something. */}
      <rect
        x={(boxW / 2 - Math.min(floorW * 0.36, 30)).toFixed(2)}
        y={(top + 2).toFixed(2)}
        width={Math.min(floorW * 0.72, 60).toFixed(2)}
        height={3}
        rx={1}
        fill="var(--board)"
      />
      {/* One rect per DESK, filled and unstroked: adjacent desks abut and
          read as one surface, while a horseshoe keeps its opening. Drawing a
          group's bounding box instead painted the U as a solid rectangle. */}
      {shape.positions.map((position) => (
        <rect
          key={`${position.x}-${position.y}`}
          x={(left + position.x * scale).toFixed(2)}
          y={(top + position.y * scale).toFixed(2)}
          width={Math.max(1.5, TABLE * scale).toFixed(2)}
          height={Math.max(1.5, TABLE * scale).toFixed(2)}
          fill="var(--wood)"
          stroke="var(--wood-edge)"
          strokeWidth={0.4}
        />
      ))}
    </svg>
  );
}
