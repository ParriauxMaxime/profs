/**
 * When a run of avertissements reads as a carton rouge.
 *
 * A practising teacher's own classroom mechanic: Y jaunes over the last X
 * séances make a rouge. The red is DERIVED here and never written as a
 * `BehaviourEvent`, the same posture `studentAverage` takes — a stored red
 * would go stale the moment the threshold moved, and deleting one of the
 * yellows behind it would leave an orphan the log still exported. A
 * `BehaviourEvent` records what a teacher OBSERVED; a red the app inferred is
 * not an observation.
 *
 * Pure, and structurally typed over its inputs, so a `Session` and a test
 * fixture both fit without the domain learning about Dexie.
 */

import type { BehaviourType } from "./behaviour";

export interface EscalationRule {
  enabled: boolean;
  /** X — how many séances the window spans, counting the one on screen. */
  seances: number;
  /** Y — yellows inside that window that make a red. */
  yellows: number;
}

/** What the demo school seeds, and what an absent settings row reads as. */
export const DEFAULT_ESCALATION: EscalationRule = { enabled: true, seances: 2, yellows: 2 };

export const MIN_ESCALATION_SEANCES = 1;
export const MAX_ESCALATION_SEANCES = 10;
/**
 * Two, not one. A rule of one yellow makes every avertissement instantly a
 * rouge — which is not an escalation, it is renaming the button, and it would
 * throw the fullscreen animation on every single tap.
 */
export const MIN_ESCALATION_YELLOWS = 2;
export const MAX_ESCALATION_YELLOWS = 10;

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, Math.trunc(value)));
}

/**
 * The floors live HERE rather than in the settings form, so a hand-edited
 * import or a future second caller cannot install a rule the app refuses to
 * express. Every function below clamps before it reads.
 */
export function clampRule(rule: EscalationRule): EscalationRule {
  return {
    enabled: rule.enabled,
    seances: clamp(rule.seances, MIN_ESCALATION_SEANCES, MAX_ESCALATION_SEANCES),
    yellows: clamp(rule.yellows, MIN_ESCALATION_YELLOWS, MAX_ESCALATION_YELLOWS),
  };
}

/** Enough of a `Session` to order it. */
export interface WindowSession {
  id: string;
  date: number;
  startsAt: number;
}

/**
 * The séance ids the rule is counting over, oldest first.
 *
 * The CLASS's séances, not the pupil's attended ones: a per-pupil window would
 * depend on attendance being marked, which is lazy and routinely incomplete,
 * and two pupils in one room would be judged on different stretches of the
 * term. *Deux sur deux* has to mean the same thing in every seat.
 *
 * Empty for a séance that does not exist — which is the case that matters in
 * practice, since a lesson where nothing has been recorded has no row at all,
 * so there is nothing to count and nobody is at red.
 */
export function escalationWindow(
  sessions: WindowSession[],
  currentSessionId: string | null,
  rule: EscalationRule,
): string[] {
  if (currentSessionId === null) return [];
  const span = clampRule(rule).seances;
  const ordered = [...sessions].sort((a, b) => a.date - b.date || a.startsAt - b.startsAt);
  const index = ordered.findIndex((session) => session.id === currentSessionId);
  if (index === -1) return [];
  return ordered.slice(Math.max(0, index - span + 1), index + 1).map((session) => session.id);
}

/**
 * The yellows inside that window, in the order they were handed in.
 *
 * Input order is preserved rather than re-sorted: the caller reads them from
 * Dexie sorted by `createdAt`, and the seat draws them oldest first.
 */
export function yellowsInWindow<E extends { sessionId: string; type: BehaviourType }>(
  events: E[],
  windowIds: string[],
): E[] {
  const ids = new Set(windowIds);
  return events.filter((event) => event.type === "yellow" && ids.has(event.sessionId));
}

/**
 * Stateless, deliberately: a pupil is at red whenever their yellows in the
 * CURRENT window reach Y, and the window simply slides. Yellow in séance 2 plus
 * yellow in séance 3 fires again even though séance 1 and 2 already did — which
 * is the truer statement, and needs no record of which yellows were "consumed".
 */
export function isEscalated(yellowCount: number, rule: EscalationRule): boolean {
  const clamped = clampRule(rule);
  if (!clamped.enabled) return false;
  return yellowCount >= clamped.yellows;
}
