import type { DiaryEntry } from "@db";
import { setDiaryEntry } from "@db/diary";
import { useDb } from "@db/provider";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One day's journal box for one class.
 *
 * Saved on blur rather than behind a button: this is written mid-lesson or at
 * 21h, and a save button is one more thing to forget. The three outcomes match
 * the rest of the app — text stores, blank clears the row, and nothing is ever
 * half-written.
 *
 * Keyed by its caller on `${classId}:${date}`, so switching day or class
 * resets the draft instead of carrying one lesson's text onto another. That is
 * the identity-anchoring rule this codebase has broken in six disguises.
 */
export function DayEntry({
  classId,
  date,
  entry,
  placeholder,
}: {
  classId: string;
  date: number;
  entry: DiaryEntry | null;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const db = useDb();
  const [text, setText] = useState(entry?.text ?? "");
  const focused = useRef(false);

  // A live query can bring in a change made in another tab. Accept it only
  // while the teacher is not typing, or their draft would be overwritten
  // mid-sentence.
  useEffect(() => {
    if (focused.current) return;
    setText(entry?.text ?? "");
  }, [entry?.text]);

  return (
    <textarea
      className="field min-h-24 w-full"
      rows={3}
      value={text}
      placeholder={placeholder ?? t("diary.placeholder")}
      aria-label={t("diary.entryLabel")}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        // Nothing typed and nothing stored: no write at all, so an idle focus
        // does not touch updatedAt.
        if (text === (entry?.text ?? "")) return;
        void setDiaryEntry(db, classId, date, text);
      }}
    />
  );
}
