import type { Placement } from "@domain/room";
import type { AppDatabase, Assignment, SeatingPlan } from ".";

/**
 * A class's arrangement in a salle, and who sits where in it.
 *
 * The salle holds the furniture and belongs to no class; a plan is one class
 * poured into it. That split is what lets 3°B and 5°A share salle 204 without
 * either one's seating reaching the other.
 */

/** The compound primary key of one pupil's place in one plan. */
export function assignmentKey(planId: string, deskId: string): [string, string] {
  return [planId, deskId];
}

/**
 * The plan for this class in this salle, creating it on first sight.
 *
 * Exactly one exists per (class, salle) — `&[classId+roomId]` makes that a
 * fact rather than something this function has to be trusted to keep — and the
 * re-check inside the transaction is what makes it idempotent under
 * StrictMode's double-invoked effects.
 */
export async function getOrCreatePlan(
  db: AppDatabase,
  classId: string,
  roomId: string,
): Promise<SeatingPlan> {
  return db.transaction("rw", db.seatingPlans, async () => {
    const existing = await db.seatingPlans.where({ classId, roomId }).first();
    if (existing) return existing;
    const plan: SeatingPlan = {
      id: crypto.randomUUID(),
      classId,
      roomId,
      updatedAt: Date.now(),
    };
    await db.seatingPlans.add(plan);
    return plan;
  });
}

/** Every plan made in a salle — who loses an arrangement if it is deleted. */
export async function plansForRoom(db: AppDatabase, roomId: string): Promise<SeatingPlan[]> {
  return db.seatingPlans.where("roomId").equals(roomId).toArray();
}

/** Every plan a class has, one per salle it is taught in. */
export async function plansForClass(db: AppDatabase, classId: string): Promise<SeatingPlan[]> {
  return db.seatingPlans.where("classId").equals(classId).toArray();
}

export async function assignmentsForPlan(db: AppDatabase, planId: string): Promise<Assignment[]> {
  return db.assignments.where("planId").equals(planId).toArray();
}

/**
 * Write one placement.
 *
 * DELETES BEFORE IT PUTS, and that ordering is required rather than tidy:
 * `&[planId+studentId]` refuses a pupil in two chairs, so putting the held
 * pupil into the target before clearing the row they came from throws, and
 * the transaction rolls back leaving the room as it was. Clearing both
 * pupils' existing rows first — by desk AND by pupil — makes the write
 * unconditional, so the same function seats from the rail, swaps two seated
 * pupils and moves one onto an empty place without branching on which it is.
 *
 * `resolvePlacement` in the domain decides WHAT happens; this only writes it.
 */
export async function applyPlacement(
  db: AppDatabase,
  planId: string,
  placement: Placement,
): Promise<void> {
  if (placement.kind === "none") return;
  const { studentId, deskId, displaced } = placement;
  await db.transaction("rw", db.assignments, async () => {
    // By desk: whatever sat at either end of the move.
    await db.assignments.delete(assignmentKey(planId, deskId));
    if (displaced?.deskId != null) {
      await db.assignments.delete(assignmentKey(planId, displaced.deskId));
    }
    // By pupil: the two people being moved, wherever they were. A pupil
    // dragged from a desk this transaction has not touched is cleared here.
    await db.assignments.where({ planId, studentId }).delete();
    if (displaced) {
      await db.assignments.where({ planId, studentId: displaced.studentId }).delete();
    }
    await db.assignments.put({ planId, deskId, studentId });
    // `displaced.deskId === null` is the rail: the occupant simply keeps no
    // assignment at all, which is what "in the rail" means.
    if (displaced?.deskId != null) {
      await db.assignments.put({
        planId,
        deskId: displaced.deskId,
        studentId: displaced.studentId,
      });
    }
  });
}

/**
 * Take a pupil out of their place, leaving the table standing.
 *
 * The pupil card's *Retirer de sa place*. Keyed by pupil rather than by desk
 * because that is what the caller has: the card is open on a person, and
 * looking their desk up first would be a read that could go stale between the
 * two.
 */
export async function unassign(db: AppDatabase, planId: string, studentId: string): Promise<void> {
  await db.assignments.where({ planId, studentId }).delete();
}
