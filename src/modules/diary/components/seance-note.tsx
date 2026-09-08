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
 *
 * `sessionId` may be null, because writing down what a lesson covered is one
 * of the four things that bring a séance into being — the class page hands
 * over `onEnsureSession` and the row is created by the blur that saves the
 * first text, never by opening the page. An idle focus writes nothing at all:
 * an unchanged draft returns before either call.
 */
export function SeanceNote({
  sessionId,
  text,
  readOnly = false,
  onEnsureSession,
}: {
  sessionId: string | null;
  text: string;
  readOnly?: boolean;
  /** Supplies the séance id when there is not one yet. */
  onEnsureSession?: () => Promise<string>;
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
        // neither touches the séance nor brings one into being.
        if (draft === text) return;
        void (async () => {
          const id = sessionId ?? (await onEnsureSession?.());
          if (id === undefined) return;
          await setSessionNote(db, id, draft);
        })();
      }}
    />
  );
}
