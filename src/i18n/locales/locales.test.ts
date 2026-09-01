import en from "./en.json";
import fr from "./fr.json";

function flatKeys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("locale catalogues", () => {
  it("fr and en have exactly the same keys", () => {
    expect(flatKeys(fr).sort()).toEqual(flatKeys(en).sort());
  });

  it("has no empty translation values", () => {
    const values = JSON.stringify(fr) + JSON.stringify(en);
    expect(values).not.toContain('""');
  });
});
