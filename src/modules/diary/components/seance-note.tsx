import { useDb } from "@db/provider";
import { setSessionNote } from "@db/sessions";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One séance's note.
 *
 * Saved on blur rather than behind a button: this is written mid-lesson or at
 * 21h, and a save button is one more thing to forget. The three outcomes match
 * the rest of the app — text stores, blank clears the field, and nothing is
 * ever half-written.
 *
 * Anchored to `sessionId` rather than to a day or a class: two lessons on one
 * day are two séances, each with its own note, and a caller must key this
 * component by `sessionId` so switching séance resets the draft instead of
 * carrying one lesson's text onto another.
 */
export function SeanceNote({
  sessionId,
  text,
  readOnly = false,
}: {
  sessionId: string;
  text: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [draft, setDraft] = useState(text);
  const focused = useRef(false);

  // A live query can bring in a change made in another tab. Accept it only
  // while the teacher is not typing, or their draft would be overwritten
  // mid-sentence.
  useEffect(() => {
    if (focused.current) return;
    setDraft(text);
  }, [text]);

  return (
    <textarea
      // The one surface in the app a teacher writes prose on, and so the only
      // one that is ruled. `.carreaux` locks line-height to the grid pitch, so
      // `rows` counts real ruled lines rather than arbitrary ones.
      className="carreaux field min-h-24 w-full"
      rows={3}
      value={draft}
      readOnly={readOnly}
      placeholder={t("diary.noNote")}
      aria-label={t("diary.entryLabel")}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        // Nothing typed and nothing stored: no write at all, so an idle focus
        // does not touch the séance.
        if (draft === text) return;
        void setSessionNote(db, sessionId, draft);
      }}
    />
  );
}
