import type { Student } from "@db";
import { SUBJECT_COLORS } from "@domain/subject";
import { useEffect, useState } from "react";

/** A stable colour for a pupil with no photo, picked from the id — not random. */
function colorFor(studentId: string): string {
  let hash = 0;
  for (let i = 0; i < studentId.length; i += 1) {
    hash = (hash * 31 + studentId.charCodeAt(i)) | 0;
  }
  return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
}

function initials(student: Student): string {
  const a = student.firstName.trim().charAt(0);
  const b = student.lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase();
}

/**
 * One seated pupil, seen from above: their photo, or their initials on a
 * colour.
 *
 * The ring is what keeps a disc legible against the desk it sits on — against
 * the old white tile it needed nothing. It doubles as the seat's attendance
 * colour when the caller passes one, which is the largest thing on a seat that
 * can carry one.
 *
 * `size` is a number rather than a class because the ring, the shadow and the
 * initials all derive from it; a caller passing `h-10 w-10` would resize the
 * circle and leave the lettering behind.
 *
 * The object URL is revoked on unmount and between selections, or a lesson
 * spent opening cards leaks one per pupil.
 */
export function PupilDisc({
  student,
  size = 30,
  ring,
}: {
  student: Student;
  size?: number;
  /** Replaces the neutral ring — the seat passes the attendance colour. */
  ring?: string;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!student.photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(student.photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [student.photo]);

  const shadow = `0 0 0 3px ${ring ?? "rgb(255 255 255 / 80%)"}, 0 2px 3px var(--room-shadow)`;

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: shadow }}
        width={size}
        height={size}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        // Scaled off the disc rather than fixed, so the initials fill a 40px
        // seat the way they filled a 30px one instead of rattling around in it.
        fontSize: Math.round(size * 0.36),
        background: colorFor(student.id),
        boxShadow: shadow,
      }}
    >
      {initials(student)}
    </div>
  );
}
