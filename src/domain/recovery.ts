/**
 * What to offer a teacher when the database refuses to open.
 *
 * `db.open()` rejecting is not an ordinary crash. The app is the only copy of
 * the data — there is no server to log into from another device, and
 * `PRIVACY.md` says so — and until React mounts there is no route to the wipe
 * in Réglages, to the JSON export, or to the workspace switcher. A rejection
 * that nobody catches is therefore not a wiped workspace but a bricked one,
 * with the pupils' names still sitting in IndexedDB and no way to reach them.
 *
 * The standing rule that schema changes are disposable, not migrated, only
 * holds if disposable means *wiped on the next boot*. This module is what
 * enforces it instead of review: an unrecognised failure classifies as
 * `corrupt`, and `corrupt` always offers the discard. A new Dexie error name
 * nobody anticipated lands on the recoverable branch by default, never on a
 * dead end.
 *
 * The classification is here rather than in the component because the reason a
 * database would not open is a rule, not a rendering concern, and because a
 * wrong branch either destroys a term of marks or leaves a teacher stuck.
 */

export const RECOVERY_KINDS = ["retry", "unsupported", "quota", "corrupt"] as const;
export type RecoveryKind = (typeof RECOVERY_KINDS)[number];

/**
 * Reloading fixes it. Another tab holding the database mid-upgrade, a
 * connection closed underneath us — the data is intact and nothing should be
 * offered that touches it.
 */
const RETRY_ERRORS = ["DatabaseClosedError", "VersionError", "AbortError", "TimeoutError"] as const;

/**
 * IndexedDB is not available at all: a private window that denies it, a
 * browser setting, a missing API. Neither a reload nor a discard helps, and
 * offering the discard here would invite a teacher to destroy a term of marks
 * to fix something that was never broken.
 */
const UNSUPPORTED_ERRORS = ["MissingAPIError", "SecurityError", "NotSupportedError"] as const;

/** Out of disk. Discarding this workspace frees the space it was using. */
const QUOTA_ERRORS = ["QuotaExceededError"] as const;

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "name" in error) {
    const { name } = error as { name: unknown };
    if (typeof name === "string") return name;
  }
  return "";
}

/**
 * Which recovery a failed open earns.
 *
 * Everything unrecognised — including `UpgradeError`, which is what a
 * primary-key change throws — is `corrupt`, because `corrupt` is the branch
 * that offers a way out. Defaulting the other way would reproduce the blank
 * page this module exists to remove.
 */
export function classifyOpenFailure(error: unknown): RecoveryKind {
  const name = errorName(error);
  if ((RETRY_ERRORS as readonly string[]).includes(name)) return "retry";
  if ((UNSUPPORTED_ERRORS as readonly string[]).includes(name)) return "unsupported";
  if ((QUOTA_ERRORS as readonly string[]).includes(name)) return "quota";
  return "corrupt";
}

/**
 * Whether this failure may offer to discard the workspace's database.
 *
 * Only where discarding could actually help. A transient failure must not
 * offer it — a teacher invited to delete on a blip would delete data that was
 * never lost — and an unsupported browser must not either, since the data is
 * fine and unreachable for an unrelated reason.
 */
export function offersDiscard(kind: RecoveryKind): boolean {
  return kind === "corrupt" || kind === "quota";
}

/**
 * Reloading is offered unconditionally, so there is no predicate for it and no
 * branch that can render a panel with nothing on it. Even where the browser
 * itself is the wall, the fix — leaving a private window, changing a setting —
 * happens outside the app and needs a reload to take effect. Making this
 * structural rather than a flag is what guarantees no failure is a dead end.
 */
