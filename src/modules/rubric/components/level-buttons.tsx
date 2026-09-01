import { RUBRIC_LEVEL_COLORS, RUBRIC_LEVELS, type RubricLevel } from "@domain/rubric";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleOption } from "../../design-system/components/primitives";

/**
 * The four-way level selector — the control a teacher taps while a pupil is
 * presenting.
 *
 * Tapping the already-selected level clears it: one tap in, one tap out, no
 * dialog, so a mis-tap mid-lesson is recoverable instantly. Colour is never
 * the sole carrier of the selected level — the translated label and
 * `aria-pressed` (set by `ToggleOption`) both carry it too.
 */
export function LevelButtons({
  value,
  onChange,
}: {
  value: RubricLevel | null;
  onChange: (next: RubricLevel | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <ToggleGroup>
      {RUBRIC_LEVELS.map((level) => (
        <ToggleOption
          key={level}
          selected={value === level}
          color={RUBRIC_LEVEL_COLORS[level]}
          onSelect={() => onChange(value === level ? null : level)}
        >
          <span className="flex items-center justify-center gap-1 leading-tight">
            <span>{t(`rubric.level.${level}`)}</span>
            <span className="text-xs opacity-80">{level}</span>
          </span>
        </ToggleOption>
      ))}
    </ToggleGroup>
  );
}
