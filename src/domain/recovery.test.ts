import { classifyOpenFailure, offersDiscard, RECOVERY_KINDS, type RecoveryKind } from "./recovery";

function dexieError(name: string): Error {
  const error = new Error(`simulated ${name}`);
  error.name = name;
  return error;
}

describe("classifyOpenFailure", () => {
  it("sends a closed connection and a version clash to a reload", () => {
    expect(classifyOpenFailure(dexieError("DatabaseClosedError"))).toBe("retry");
    expect(classifyOpenFailure(dexieError("VersionError"))).toBe("retry");
    expect(classifyOpenFailure(dexieError("AbortError"))).toBe("retry");
    expect(classifyOpenFailure(dexieError("TimeoutError"))).toBe("retry");
  });

  it("sends a browser without IndexedDB to the unsupported branch", () => {
    expect(classifyOpenFailure(dexieError("MissingAPIError"))).toBe("unsupported");
    expect(classifyOpenFailure(dexieError("SecurityError"))).toBe("unsupported");
    expect(classifyOpenFailure(dexieError("NotSupportedError"))).toBe("unsupported");
  });

  it("separates a full disk from a broken database", () => {
    expect(classifyOpenFailure(dexieError("QuotaExceededError"))).toBe("quota");
  });

  it("treats a schema that cannot be opened as corrupt", () => {
    expect(classifyOpenFailure(dexieError("UpgradeError"))).toBe("corrupt");
    expect(classifyOpenFailure(dexieError("InvalidStateError"))).toBe("corrupt");
    expect(classifyOpenFailure(dexieError("SchemaError"))).toBe("corrupt");
    expect(classifyOpenFailure(dexieError("UnknownError"))).toBe("corrupt");
  });

  it("never throws on a value that is not an error", () => {
    expect(classifyOpenFailure(undefined)).toBe("corrupt");
    expect(classifyOpenFailure(null)).toBe("corrupt");
    expect(classifyOpenFailure("a string")).toBe("corrupt");
    expect(classifyOpenFailure({ nothing: true })).toBe("corrupt");
    expect(classifyOpenFailure(new Error("no name set"))).toBe("corrupt");
  });
});

describe("the disposable-not-migrated doctrine", () => {
  // The rule in CLAUDE.md is that a stale workspace gets wiped, not migrated.
  // That only holds if a schema Dexie refuses to open leaves a way to discard
  // it. `UpgradeError` is what a primary-key change throws, and phase 7 split
  // one migration in two specifically to dodge it; this asserts the class of
  // failure has an exit, not just that one instance was dodged.
  it("always offers to discard the workspace when the schema will not open", () => {
    expect(offersDiscard(classifyOpenFailure(dexieError("UpgradeError")))).toBe(true);
  });

  it("offers the discard for an error name nobody anticipated", () => {
    // The default branch is the recoverable one on purpose. A future Dexie
    // release naming a failure we have never seen must not brick the app.
    expect(offersDiscard(classifyOpenFailure(dexieError("SomeFutureDexieError")))).toBe(true);
  });

  it("never leaves a failure with nothing at all to do", () => {
    // Reload is unconditional in the shell, so every kind has at least one
    // action by construction. What this asserts is the other half: that no
    // kind is left needing a discard it is not offered.
    for (const kind of RECOVERY_KINDS) {
      expect(kind === "corrupt" || kind === "quota" ? offersDiscard(kind) : true).toBe(true);
    }
  });
});

describe("offersDiscard", () => {
  it("withholds the discard where losing the data could not help", () => {
    // Offering deletion on a blip invites a teacher to destroy a term of marks
    // that was never at risk.
    expect(offersDiscard("retry")).toBe(false);
    expect(offersDiscard("unsupported")).toBe(false);
  });

  it("offers it where the data is the problem or the space is", () => {
    expect(offersDiscard("corrupt")).toBe(true);
    expect(offersDiscard("quota")).toBe(true);
  });
});

describe("RECOVERY_KINDS", () => {
  it("is the closed set the shell renders", () => {
    // The shell switches on this; a kind added without copy would render blank.
    const kinds: RecoveryKind[] = ["retry", "unsupported", "quota", "corrupt"];
    expect([...RECOVERY_KINDS]).toEqual(kinds);
  });
});
