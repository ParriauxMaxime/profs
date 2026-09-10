import type { BehaviourEvent, Student } from "@db";
import { ATTENDANCE_COLORS, type AttendanceValue } from "@domain/attendance";
import { BEHAVIOUR_COLORS } from "@domain/behaviour";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";
import { PupilDisc } from "./pupil-disc";

/** Beyond this the cards stop being countable and become "+n". */
const MAX_CARDS = 3;

/**
 * What a seat says about a pupil without being opened.
 *
 * It reports the register and never writes it — the card is still where a mark
 * is made. What this answers is a question about the ROOM rather than about a
 * pupil: who has been marked, and who has already collected something. Before
 * it, that was one tap per seat.
 *
 * **A behaviour event is drawn as a CARD**, a real rectangle, and that is the
 * one part of this that is not decoration. It was a 6px dot, which has almost
 * no area — a yellow card was invisible from a metre away, which is the whole
 * reason a teacher would want it on the plan at all. A rectangle this size has
 * roughly four times that area, and it is what the domain already calls the
 * thing. One per event rather than per type: three reds in a lesson is a
 * different morning from one, and a per-type mark would flatten exactly what a
 * teacher is watching.
 *
 * **Attendance is carried twice** — the ring around the face, and a pill at its
 * top right. That is not redundancy: with the pill alone, an absent pupil's
 * badge and a *mot dans le carnet* card a few pixels away were two red shapes
 * told apart only by which corner they sat in. A ring around a face cannot be
 * read as a card clipped beside one, and being the largest coloured thing on
 * the seat it is what makes an absence legible across a whole plan.
 *
 * **An unmarked pupil keeps the neutral ring and draws no pill.** There is no
 * colour for "not recorded" and there must not be: `attendance.ts` defines no
 * default precisely so an unmarked seat reads as *nobody marked this* rather
 * than as *présent*.
 *
 * The pill is colour alone on screen — a knowing exception to this codebase's
 * rule that colour never carries state by itself, because a letter at this
 * size was unreadable at the scale a room shrinks to and fought the initials
 * under it. The word is on the seat's `title` and in its accessible name,
 * built by `useSeatLabel` below so a mark can never be added without one.
 */
export function SeatOccupant({
  student,
  attendance,
  events,
}: {
  student: Student;
  /** This pupil's mark for the séance on screen, or null when nobody marked. */
  attendance: AttendanceValue | null;
  /** Their events for that same séance, oldest first. */
  events: BehaviourEvent[];
}) {
  const cards = events.slice(0, MAX_CARDS);
  const overflow = events.length - cards.length;

  return (
    <>
      <div className="relative">
        <PupilDisc
          student={student}
          size={40}
          ring={attendance ? ATTENDANCE_COLORS[attendance] : undefined}
        />

        {events.length > 0 && (
          <span className="-top-1 -left-3 absolute flex items-start gap-[1px]">
            {cards.map((event) => (
              <span
                key={event.id}
                className="block h-[13px] w-[9px] rounded-[1px]"
                style={{
                  background: BEHAVIOUR_COLORS[event.type],
                  boxShadow: "0 0 0 1px rgb(255 255 255 / 80%), 0 1px 2px var(--room-shadow)",
                }}
              />
            ))}
            {overflow > 0 && (
              <span
                className="ml-[1px] font-bold text-[9px] leading-none"
                style={{ color: "var(--desk-ink)" }}
              >
                +{overflow}
              </span>
            )}
          </span>
        )}

        {attendance && (
          <span
            aria-hidden="true"
            className="-top-1 -right-2 absolute block h-[10px] w-[16px] rounded-full"
            style={{
              background: ATTENDANCE_COLORS[attendance],
              boxShadow: "0 0 0 1.5px rgb(255 255 255 / 85%)",
            }}
          />
        )}
      </div>

      {/* 12px, and sized against the FLOOR rather than against this drawing.
          `MIN_SCALE` keeps a place at 44px however big `UNIT_PX` is, so the
          scale a narrow column settles at fell in proportion when the unit
          rose — a name sized by how it looks on a desktop renders about 6px on
          a phone. Anything else measured in px on this tile owes the same
          arithmetic. */}
      <span
        className="w-full px-0.5 text-center text-xs leading-tight"
        style={{ color: "var(--desk-ink)" }}
      >
        <PupilName student={student} format="stacked" />
      </span>
    </>
  );
}

/**
 * What a seat is called, for the tile's `title` and accessible name.
 *
 * This is where the attendance word and the behaviour tally live, since the
 * ring, the pill and the cards above are colour and position only. Built
 * beside them rather than in the page so the two cannot drift: a mark added
 * without a word to go with it is the failure this pairing exists to prevent.
 */
export function useSeatLabel(): (
  student: Student,
  attendance: AttendanceValue | null,
  events: BehaviourEvent[],
) => string {
  const { t } = useTranslation();

  return (student, attendance, events) => {
    const parts = [`${student.lastName} ${student.firstName}`];
    if (attendance) parts.push(t(`attendance.${attendance}`));
    for (const type of new Set(events.map((event) => event.type))) {
      const count = events.filter((event) => event.type === type).length;
      parts.push(`${t(`behaviour.${type}`)} × ${count}`);
    }
    return parts.join(" — ");
  };
}
