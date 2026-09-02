import type { StudentGroup } from "@db";
import { resolveGroupSelection } from "@domain/group";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleOption } from "../../design-system/components/primitives";

/**
 * The one group filter, reused by the class roster, the seating plan's
 * unseated pool, and the gradebook grid.
 *
 * The selection is a group id, never an index or a position in `groups` —
 * this codebase has produced the position-vs-identity bug in several
 * disguises already. When the selected group no longer exists (deleted from
 * under a held selection), the control falls back to "Tous" rather than
 * rendering nothing selected or throwing.
 */
export function GroupFilter({
  groups,
  selectedGroupId,
  onSelect,
}: {
  groups: StudentGroup[];
  selectedGroupId: string | null;
  onSelect: (groupId: string | null) => void;
}) {
  const { t } = useTranslation();

  if (groups.length === 0) return null;

  const effectiveId = resolveGroupSelection(groups, selectedGroupId);

  return (
    <ToggleGroup label={t("group.filterLabel")}>
      <ToggleOption selected={effectiveId === null} onSelect={() => onSelect(null)}>
        {t("group.all")}
      </ToggleOption>
      {groups.map((group) => (
        <ToggleOption
          key={group.id}
          selected={effectiveId === group.id}
          onSelect={() => onSelect(group.id)}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: group.color }}
              aria-hidden="true"
            />
            {group.name}
          </span>
        </ToggleOption>
      ))}
    </ToggleGroup>
  );
}
