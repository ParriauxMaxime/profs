/**
 * Pupil photographs are downscaled before they are stored.
 *
 * A phone camera produces several megabytes per shot; thirty of those in
 * IndexedDB for one class is an avoidable liability as well as a slow page.
 * A centre square at 256px is enough to recognise a face in a seating grid.
 */

export const PHOTO_SIZE = 256;

export interface Crop {
  sx: number;
  sy: number;
  size: number;
}

/** The largest centred square that fits inside the source image. */
export function squareCrop(width: number, height: number): Crop {
  const size = Math.min(width, height);
  return {
    sx: Math.round((width - size) / 2),
    sy: Math.round((height - size) / 2),
    size,
  };
}
