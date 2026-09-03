import { PHOTO_SIZE } from "./photo";

/**
 * Generated faces for the demo school.
 *
 * The seed used to carry no photograph at all, on the grounds that a
 * fabricated Blob would be a fabricated photograph of a fictional child. That
 * still holds for anything photographic. What is drawn here is deliberately
 * not: flat vector shapes, three mouths, four hair shapes, no shading and no
 * attempt at likeness. It reads as an illustration at a glance, which is what
 * lets the demo exercise the photo path — the seat tile, the pupil card, the
 * pupil page — without pretending to depict anybody.
 *
 * Every choice is derived from the pupil's id, so a face never moves between
 * pupils when the demo is reseeded, and about a third of pupils get none at
 * all: that is what a roster looks like in mid-September, and it keeps the
 * initials fallback on screen where a regression in it stays visible.
 *
 * The markup is built as a string rather than on a canvas because the seed is
 * tested under Jest in the `node` environment, where there is no DOM.
 */

/** Skin tones, spanning the range a French classroom actually holds. */
export const AVATAR_SKINS = ["#f2d3b8", "#e0b48f", "#c68a63", "#95603f", "#6b4430"] as const;

/**
 * Hair. No grey: these are eleven-to-fifteen-year-olds, and a grey-haired
 * pupil in the demo reads as a rendering bug rather than as variety.
 */
export const AVATAR_HAIRS = ["#2b2118", "#5a3a22", "#8a5a2b", "#c98f3f", "#a33b2a"] as const;

/**
 * The jumper below the chin. Its own palette, not the hair colour: painting
 * the shoulders in hair made every avatar read as a hooded figure at the 32px
 * the seat tile draws them at, which is the size that matters most.
 */
export const AVATAR_CLOTHES = ["#3f6fa3", "#4b7a5a", "#8a4a52", "#5b5470", "#a8763e"] as const;

/** The ground behind the head. Muted: the face is the subject, not the tile. */
export const AVATAR_GROUNDS = ["#cfe3f5", "#d8e8d2", "#f3ddd2", "#e2dcef", "#f6e7c4"] as const;

/** Ink for the features. One value, so eyes and mouth always agree. */
const INK = "#1f2430";

const HAIR_SHAPES = 4;
const MOUTH_SHAPES = 3;

/**
 * A stable non-negative hash of a seed string.
 *
 * The same shape the seating grid already uses for its fallback colour: small,
 * deterministic, and not trying to be a cryptographic anything.
 */
export function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Whether this pupil gets a face at all — about two in three, stably. */
export function hasAvatar(seed: string): boolean {
  return hashSeed(seed) % 3 !== 0;
}

/**
 * Pick from a palette using a trait-specific hash of the seed.
 *
 * Each trait salts the seed with its own name rather than reading a different
 * decimal place of one hash. Digits of a 31-multiplier hash are not
 * independent for sequential ids like a run of UUIDs: the first version of
 * this picked hair shape from the thousands place and never produced shape 0
 * in 500 seeds, so a quarter of the drawings did not exist. Salting mixes the
 * whole string per trait, and the coverage test in `avatar.test.ts` is what
 * caught it.
 */
function pick<T>(seed: string, trait: string, palette: readonly T[]): T {
  return palette[hashSeed(`${seed}:${trait}`) % palette.length];
}

/** One pupil's face, as SVG markup at the app's stored photo size. */
export function avatarSvg(seed: string): string {
  const skin = pick(seed, "skin", AVATAR_SKINS);
  const hair = pick(seed, "hair", AVATAR_HAIRS);
  const ground = pick(seed, "ground", AVATAR_GROUNDS);
  const clothes = pick(seed, "clothes", AVATAR_CLOTHES);
  const hairShape = hashSeed(`${seed}:hairShape`) % HAIR_SHAPES;
  const mouthShape = hashSeed(`${seed}:mouth`) % MOUTH_SHAPES;
  // A few pixels of eye spacing, so faces sharing a palette are still not
  // identical below the hairline.
  const eyeGap = 26 + (hashSeed(`${seed}:eyes`) % 3) * 3;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PHOTO_SIZE} ${PHOTO_SIZE}" width="${PHOTO_SIZE}" height="${PHOTO_SIZE}" data-hair="${hairShape}" data-mouth="${mouthShape}">`,
    `<rect width="${PHOTO_SIZE}" height="${PHOTO_SIZE}" fill="${ground}"/>`,
    // Shoulders, cropped by the frame: without them the head floats.
    `<path d="M40 256c0-46 39-72 88-72s88 26 88 72z" fill="${clothes}"/>`,
    // The neck, drawn before the head so the jaw overlaps it.
    `<rect x="112" y="150" width="32" height="42" fill="${skin}"/>`,
    `<ellipse cx="128" cy="118" rx="62" ry="70" fill="${skin}"/>`,
    hairPath(hairShape, hair),
    // Eyes big enough to survive the 32px seat tile: at r="7" they vanished.
    `<circle cx="${128 - eyeGap}" cy="112" r="9" fill="${INK}"/>`,
    `<circle cx="${128 + eyeGap}" cy="112" r="9" fill="${INK}"/>`,
    mouthPath(mouthShape),
    "</svg>",
  ].join("");
}

function hairPath(shape: number, hair: string): string {
  switch (shape) {
    case 0:
      // Cropped short.
      return `<path d="M66 108c0-38 28-62 62-62s62 24 62 62c-12-22-34-30-62-30s-50 8-62 30z" fill="${hair}"/>`;
    case 1:
      // Long, falling past the jaw on both sides.
      return `<path d="M62 118c0-44 30-72 66-72s66 28 66 72v62c-8 0-14-8-16-24-8-26-20-38-50-38s-42 12-50 38c-2 16-8 24-16 24z" fill="${hair}"/>`;
    case 2:
      // Side parting.
      return `<path d="M66 112c0-40 28-66 62-66 30 0 54 18 60 46-18-14-40-20-66-16-22 4-42 16-56 36z" fill="${hair}"/>`;
    default:
      // Tight curls, drawn as a scalloped cap.
      return `<path d="M70 106a58 58 0 0 1 116 0 26 26 0 0 0-22-16 26 26 0 0 0-22 8 26 26 0 0 0-25-12 26 26 0 0 0-25 12 26 26 0 0 0-22-8 26 26 0 0 0-22 16z" fill="${hair}"/>`;
  }
}

function mouthPath(shape: number): string {
  switch (shape) {
    case 0:
      // A slight smile.
      return `<path d="M108 148c8 10 32 10 40 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    case 1:
      // Straight.
      return `<path d="M110 150h36" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    default:
      // Open, mid-sentence.
      return `<ellipse cx="128" cy="152" rx="14" ry="10" fill="${INK}"/>`;
  }
}
