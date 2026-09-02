import { ATTENDANCE_VALUES } from "@domain/attendance";
import { BEHAVIOUR_COLORS, BEHAVIOUR_TEXT_COLORS, BEHAVIOUR_TYPES } from "@domain/behaviour";
import { RUBRIC_LEVEL_COLORS, RUBRIC_LEVEL_TEXT_COLORS, RUBRIC_LEVELS } from "@domain/rubric";
import { SUBJECT_COLORS } from "@domain/subject";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmButton } from "./components/confirm-button";
import { ActionButton, Chip, SeatTile, ToggleGroup, ToggleOption } from "./components/primitives";

/**
 * Every primitive, in every state, on one page.
 *
 * Coherence is a property you can only judge by seeing things side by side,
 * and this app's controls are otherwise spread across six flows behind a
 * seating plan and a gradebook. One screenshot of this route answers "does
 * this hang together" far better than navigating to each surface in turn.
 *
 * It is a development aid and carries no data: nothing here touches the
 * database, so it is safe to open on a teacher's device.
 */
export function DesignPage() {
  const { t } = useTranslation();
  const [attendance, setAttendance] = useState<string | null>("present");
  const [level, setLevel] = useState<number | null>(3);
  const [armedSeat, setArmedSeat] = useState(false);
  const [design, setDesign] = useState<string>("neutral");

  // Applied on the document element so every route previews the direction,
  // not just this page. Nothing persists it: a direction is chosen by editing
  // global.css, and this switcher only exists to compare them.
  useEffect(() => {
    const root = document.documentElement;
    if (design === "neutral") root.removeAttribute("data-design");
    else root.setAttribute("data-design", design);
    return () => root.removeAttribute("data-design");
  }, [design]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-semibold text-lg">Design system</h2>
        <p className="text-sm text-text-muted">
          Development reference. Every live-entry control is at least 44px tall by construction —
          the height comes from <code>--control-min</code>, not from each caller.
        </p>
      </div>

      <Section title="Direction">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "neutral", label: "Neutre", note: "what ships today" },
            { id: "copie", label: "Copie", note: "paper, ink blue, red marge" },
            { id: "encre", label: "Encre", note: "quiet, serif headings" },
            { id: "ardoise", label: "Ardoise", note: "dark, for a dim room" },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={design === d.id}
              className={`btn flex-col items-start ${design === d.id ? "btn-primary" : ""}`}
              onClick={() => setDesign(d.id)}
            >
              <span>{d.label}</span>
              <span className="font-normal text-xs opacity-70">{d.note}</span>
            </button>
          ))}
        </div>
        <div className="paper rounded-(--control-radius) border border-border p-4">
          <p className="font-medium">Sheet surface</p>
          <p className="text-sm text-text-muted">
            The signature: faint Seyès ruling and the red marge a pupil leaves for the teacher's
            remarks. Visible only in Copie; other directions null the tokens out.
          </p>
        </div>
      </Section>

      <Section title="Colour tokens">
        <div className="flex flex-wrap gap-2">
          {[
            "bg",
            "bg-subtle",
            "bg-hover",
            "border",
            "text",
            "text-muted",
            "text-faint",
            "accent",
            "danger",
            "success",
          ].map((name) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-20 rounded-(--control-radius) border border-border"
                style={{ background: `var(--color-${name})` }}
              />
              <span className="text-text-muted text-xs">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons — the shared control scale">
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton onClick={() => {}}>Default</ActionButton>
          <ActionButton variant="primary" onClick={() => {}}>
            Primary
          </ActionButton>
          <ActionButton variant="danger" onClick={() => {}}>
            Danger
          </ActionButton>
          <ActionButton onClick={() => {}} disabled>
            Disabled
          </ActionButton>
          <ConfirmButton
            danger
            label="Two-step delete"
            confirmLabel="Really delete, with its 5 grades?"
            onConfirm={() => {}}
          />
        </div>
        <p className="text-text-muted text-xs">
          Destructive actions never use a browser dialog: the first tap arms, the second acts, and
          the confirm label names what else goes.
        </p>
      </Section>

      <Section title="Attendance — one tap sets, tapping again clears">
        <ToggleGroup label={t("attendance.title")}>
          {ATTENDANCE_VALUES.map((value) => (
            <ToggleOption
              key={value}
              selected={attendance === value}
              onSelect={() => setAttendance(attendance === value ? null : value)}
            >
              {t(`attendance.${value}`)}
            </ToggleOption>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Behaviour — colour plus label, never colour alone">
        <ToggleGroup label={t("behaviour.title")}>
          {BEHAVIOUR_TYPES.map((type) => (
            <ToggleOption
              key={type}
              selected
              color={BEHAVIOUR_COLORS[type]}
              textColor={BEHAVIOUR_TEXT_COLORS[type]}
              onSelect={() => {}}
            >
              {t(`behaviour.${type}`)}
            </ToggleOption>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap gap-2">
          {BEHAVIOUR_TYPES.map((type) => (
            <Chip key={type} color={BEHAVIOUR_COLORS[type]}>
              {t(`behaviour.${type}`)}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Rubric levels — 1 to 4">
        <ToggleGroup>
          {RUBRIC_LEVELS.map((value) => (
            <ToggleOption
              key={value}
              selected={level === value}
              color={RUBRIC_LEVEL_COLORS[value]}
              textColor={RUBRIC_LEVEL_TEXT_COLORS[value]}
              onSelect={() => setLevel(level === value ? null : value)}
            >
              {/* The label keys arrive with the rubric UI; until then the
                  number stands alone rather than being rendered twice. */}
              {t(`rubric.level.${value}`, { defaultValue: "" }) || null}
              <span className="ml-1 opacity-70 text-xs">{value}</span>
            </ToggleOption>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Seat tiles — the three states">
        <div className="flex flex-wrap gap-2">
          <SeatTile onClick={() => setArmedSeat(!armedSeat)} armed={armedSeat}>
            <span className="text-[11px] text-text-muted">Place libre</span>
          </SeatTile>
          <SeatTile onClick={() => {}}>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full font-semibold text-white text-xs"
              style={{ background: SUBJECT_COLORS[0] }}
            >
              CD
            </span>
            <span className="w-full truncate text-[10px]">Durand</span>
          </SeatTile>
          <SeatTile onClick={() => {}} dashed>
            <span className="text-[10px] text-text-faint">Ajouter</span>
          </SeatTile>
        </div>
        <p className="text-text-muted text-xs">
          A gap is the absence of a seat row, an empty seat has no pupil, an occupied one does.
          Outside layout-edit mode a gap renders as plain floor, not as a control.
        </p>
      </Section>

      <Section title="Fields">
        <div className="flex flex-wrap items-center gap-2">
          <input className="field w-64" placeholder="Texte" />
          <input className="field w-20" defaultValue={5} type="number" />
        </div>
      </Section>

      <Section title="Subject palette">
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((color) => (
            <div
              key={color}
              className="h-10 w-10 rounded-full border border-border"
              style={{ background: color }}
              title={color}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="border-border border-b pb-1 font-medium text-text-muted text-sm">{title}</h3>
      {children}
    </section>
  );
}
