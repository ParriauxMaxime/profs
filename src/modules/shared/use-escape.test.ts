import { isEscapeKey } from "./use-escape";

describe("isEscapeKey", () => {
  it("matches the Escape key", () => {
    expect(isEscapeKey({ key: "Escape" })).toBe(true);
  });

  it("does not match any other key", () => {
    expect(isEscapeKey({ key: "Enter" })).toBe(false);
    expect(isEscapeKey({ key: "a" })).toBe(false);
    expect(isEscapeKey({ key: "Esc" })).toBe(false);
  });
});
