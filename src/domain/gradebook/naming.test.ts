import { defaultGradebookName } from "./naming";

describe("defaultGradebookName", () => {
  it("joins the subject and the class with an em dash", () => {
    expect(defaultGradebookName("Mathématiques", "3°B")).toBe("Mathématiques — 3°B");
  });

  it("trims both parts", () => {
    expect(defaultGradebookName("  Français ", " 5°A ")).toBe("Français — 5°A");
  });

  it("falls back to whichever part is known when the other is missing", () => {
    expect(defaultGradebookName("Mathématiques", "")).toBe("Mathématiques");
    expect(defaultGradebookName("", "3°B")).toBe("3°B");
    expect(defaultGradebookName("", "")).toBe("");
  });
});
