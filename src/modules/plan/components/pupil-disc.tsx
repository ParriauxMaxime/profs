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
 * The white ring is what keeps a disc legible against the wood it now sits on
 * — against the old white tile it needed nothing.
 */
export function PupilDisc({ student }: { student: Student }) {
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

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className="h-[30px] w-[30px] rounded-full object-cover"
        style={{ boxShadow: "0 0 0 2px rgb(255 255 255 / 75%), 0 2px 3px var(--room-shadow)" }}
        width={30}
        height={30}
      />
    );
  }

  return (
    <div
      className="flex h-[30px] w-[30px] items-center justify-center rounded-full font-bold text-white text-xs"
      style={{
        background: colorFor(student.id),
        boxShadow: "0 0 0 2px rgb(255 255 255 / 75%), 0 2px 3px var(--room-shadow)",
      }}
    >
      {initials(student)}
    </div>
  );
}
