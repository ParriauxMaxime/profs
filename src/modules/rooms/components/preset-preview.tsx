import { TABLE } from "@domain/room";
import { buildRoom, type RoomTemplate } from "@domain/room-templates";

/**
 * A thumbnail of the shape a preset will stamp.
 *
 * Drawn from `buildRoom` — the SAME generator that will do the stamping — and
 * grouped by the same `tableGroups` the room uses, so a preset that promises
 * tables de deux cannot show pairs and then produce singles. A hand-drawn icon
 * would drift the first time a generator changed.
 */
export function PresetPreview({ template }: { template: RoomTemplate }) {
  const shape = buildRoom(template);
  // Fit the whole room into a fixed box; the thumbnail is a glance, not a plan.
  const boxW = 120;
  const boxH = 56;
  const scale = Math.min(boxW / shape.width, boxH / shape.height);

  return (
    <svg
      width={boxW}
      height={boxH}
      viewBox={`0 0 ${boxW} ${boxH}`}
      aria-hidden="true"
      style={{ background: "var(--floor)", borderRadius: 3 }}
    >
      {/* The board, so an arc and a horseshoe read as facing something. */}
      <rect x={boxW / 2 - 22} y={1} width={44} height={3} rx={1} fill="var(--board)" />
      {/* One rect per DESK, filled and unstroked: adjacent desks abut and
          read as one surface, while a horseshoe keeps its opening. Drawing a
          group's bounding box instead painted the U as a solid rectangle. */}
      {shape.positions.map((position) => (
        <rect
          key={`${position.x}-${position.y}`}
          x={(position.x * scale + (boxW - shape.width * scale) / 2).toFixed(2)}
          y={(position.y * scale + (boxH - shape.height * scale) / 2).toFixed(2)}
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
