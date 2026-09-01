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
  compact = false,
}: {
  value: RubricLevel | null;
  onChange: (next: RubricLevel | null) => void;
  /**
   * Show the level number alone instead of its label.
   *
   * The desktop matrix puts four of these in every cell of a pupils-by-
   * criteria table; spelling out "En cours d'acquisition" twelve times per
   * row buries the one thing that view is for, which is reading the shape of
   * the class at a glance. The full label stays reachable as the accessible
   * name and the tooltip, so nothing is lost to a screen reader.
   */
  compact?: boolean;
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
          ariaLabel={compact ? t(`rubric.level.${level}`) : undefined}
          title={compact ? t(`rubric.level.${level}`) : undefined}
        >
          {compact ? (
            <span className="font-semibold tabular-nums">{level}</span>
          ) : (
            <span className="flex items-center justify-center gap-1 leading-tight">
              <span>{t(`rubric.level.${level}`)}</span>
              <span className="text-xs opacity-80">{level}</span>
            </span>
          )}
        </ToggleOption>
      ))}
    </ToggleGroup>
  );
}
