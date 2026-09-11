import type { BehaviourEvent, Student } from "@db";
import { ATTENDANCE_COLORS, type AttendanceValue } from "@domain/attendance";
import { BEHAVIOUR_COLORS, type BehaviourType } from "@domain/behaviour";
import { useTranslation } from "react-i18next";
import { PupilName } from "../../design-system/components/pupil-name";
import { PupilDisc } from "./pupil-disc";

/**
 * Four, not three, and it is one run rather than two.
 *
 * The tile now carries three kinds of thing — the window's earlier yellows, this
 * séance's events, and the derived red — and two runs with two overflow counts
 * on a 44px tile is a puzzle rather than a reading. Over budget, slots are
 * dropped from the LEFT and `+n` goes there, so the newest events and the red
 * are never what falls off.
 */
const MAX_CARDS = 4;

interface SeatCard {
  key: string;
  /** `prior` draws hollow; the other two draw filled. */
  kind: "prior" | "current" | "derived";
  type: BehaviourType;
}

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
  priorYellows,
  escalated,
}: {
  student: Student;
  /** This pupil's mark for the séance on screen, or null when nobody marked. */
  attendance: AttendanceValue | null;
  /** Their events for that same séance, oldest first. */
  events: BehaviourEvent[];
  /**
   * Their yellows from the EARLIER séances of the escalation window, oldest
   * first. Only yellows, and only from inside the window: these are precisely
   * what the rule is counting, so the seat reads as the rule itself — two
   * hollow plus one solid IS the red. A past green or a past mot dans le
   * carnet would be history this tile was never for, and with a budget of four
   * it would push out the one fact the history exists to carry.
   */
  priorYellows: BehaviourEvent[];
  /** Whether the rule says this pupil is at red right now. */
  escalated: boolean;
}) {
  const all: SeatCard[] = [
    ...priorYellows.map((event) => ({
      key: event.id,
      kind: "prior" as const,
      type: event.type,
    })),
    ...events.map((event) => ({ key: event.id, kind: "current" as const, type: event.type })),
    // Last in the run, hard against the face — the consequence, closest to the
    // person. It draws as an ORDINARY red card: at 9px, "red" is the entire
    // message, and marking it as derived would cost more pixels than the
    // distinction buys. The word lives in `useSeatLabel` instead, which is
    // where the attendance pill already puts its own.
    ...(escalated
      ? [{ key: "derived-red", kind: "derived" as const, type: "red" as BehaviourType }]
      : []),
  ];
  const overflow = Math.max(0, all.length - MAX_CARDS);
  const cards = all.slice(overflow);

  return (
    <>
      <div className="relative">
        <PupilDisc
          student={student}
          size={40}
          ring={attendance ? ATTENDANCE_COLORS[attendance] : undefined}
        />

        {cards.length > 0 && (
          <span className="-top-1 -left-3 absolute flex items-start gap-[1px]">
            {overflow > 0 && (
              <span
                className="mr-[1px] font-bold text-[9px] leading-none"
                style={{ color: "var(--desk-ink)" }}
              >
                +{overflow}
              </span>
            )}
            {cards.map((card) => (
              <span
                key={card.key}
                className="block h-[13px] w-[9px] rounded-[1px]"
                style={
                  card.kind === "prior"
                    ? {
                        // Hollow, not literally dashed: a dashed stroke on a
                        // 9×13px box is about four dashes and reads as noise at
                        // the scale a room shrinks to — the same argument that
                        // turned the behaviour dot into a rectangle. The inset
                        // ring is the border; the outer ring is the white
                        // separation every card on this tile carries.
                        background: "color-mix(in srgb, var(--behaviour-yellow) 22%, transparent)",
                        boxShadow:
                          "inset 0 0 0 1px var(--behaviour-yellow), 0 0 0 1px rgb(255 255 255 / 80%)",
                      }
                    : {
                        background: BEHAVIOUR_COLORS[card.type],
                        boxShadow: "0 0 0 1px rgb(255 255 255 / 80%), 0 1px 2px var(--room-shadow)",
                      }
                }
              />
            ))}
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
  escalated: boolean,
  seances: number,
  windowYellows: number,
) => string {
  const { t } = useTranslation();

  return (student, attendance, events, escalated, seances, windowYellows) => {
    const parts = [`${student.lastName} ${student.firstName}`];
    if (attendance) parts.push(t(`attendance.${attendance}`));
    for (const type of new Set(events.map((event) => event.type))) {
      const count = events.filter((event) => event.type === type).length;
      parts.push(`${t(`behaviour.${type}`)} × ${count}`);
    }
    // The hollow cards are shape alone on screen; `windowYellows` — read from
    // the same `escalationContext` result they are built from, not
    // recomputed here — is the word that stands for them. Off is off: the
    // context short-circuits to an empty window for a disabled rule, so this
    // count is already zero and needs no guard of its own.
    if (windowYellows > 0) {
      parts.push(t("escalation.windowCount", { count: windowYellows, seances }));
    }
    // And the derived red is colour alone, so it says its own name here.
    if (escalated) parts.push(t("escalation.redCard"));
    return parts.join(" — ");
  };
}
