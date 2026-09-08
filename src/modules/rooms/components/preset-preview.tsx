import { buildRoom, type RoomTemplate } from "@domain/room-templates";
import { RoomThumbnail } from "./room-thumbnail";

/**
 * A thumbnail of the shape a preset will stamp.
 *
 * Drawn by `RoomThumbnail` from `buildRoom` — the SAME generator that will do
 * the stamping, and the same component that draws a salle that already exists
 * — so a preset promising tables de deux cannot show pairs and then produce
 * singles, and a salle cannot look unlike the preset it was stamped from.
 */
export function PresetPreview({ template }: { template: RoomTemplate }) {
  return <RoomThumbnail shape={buildRoom(template)} />;
}
