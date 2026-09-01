import { PHOTO_SIZE, squareCrop } from "./photo";

describe("squareCrop", () => {
  it("takes the centre of a landscape image", () => {
    expect(squareCrop(1000, 500)).toEqual({ sx: 250, sy: 0, size: 500 });
  });

  it("takes the centre of a portrait image", () => {
    expect(squareCrop(500, 1000)).toEqual({ sx: 0, sy: 250, size: 500 });
  });

  it("leaves a square alone", () => {
    expect(squareCrop(400, 400)).toEqual({ sx: 0, sy: 0, size: 400 });
  });

  it("targets a small square", () => {
    expect(PHOTO_SIZE).toBe(256);
  });
});
