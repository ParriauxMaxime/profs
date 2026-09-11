import type { Student } from "@db";
import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { RedCardOverlay } from "./red-card-overlay";

/**
 * One overlay for the whole app.
 *
 * The pupil card is rendered from two places — a seat on the plan, and a row of
 * the salle-less roster register — and each mounting an overlay of its own
 * would put two red cards on screen the day a third surface appears. Announcing
 * is a call; the overlay lives at the root.
 */
const AnnounceContext = createContext<(student: Student) => void>(() => {});

export function useAnnounceRedCard(): (student: Student) => void {
  return useContext(AnnounceContext);
}

interface Announced {
  student: Student;
  /** Changes on every announcement, so a SECOND red for the same pupil
      remounts the overlay and replays the entrance rather than sitting there
      unchanged. The rule keeps firing as the window slides; the animation has
      to keep up with it. */
  at: number;
}

export function EscalationProvider({ children }: { children: ReactNode }) {
  const [announced, setAnnounced] = useState<Announced | null>(null);

  const announce = useCallback((student: Student) => {
    setAnnounced({ student, at: Date.now() });
  }, []);

  const dismiss = useCallback(() => setAnnounced(null), []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      {announced && (
        <RedCardOverlay key={announced.at} student={announced.student} onDone={dismiss} />
      )}
    </AnnounceContext.Provider>
  );
}
