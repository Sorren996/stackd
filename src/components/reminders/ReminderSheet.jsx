import { useId, useState } from "react";
import LogSheetShell from "@/components/forms/LogSheetShell";
import ChoiceRow from "@/components/notifications/ChoiceRow";
import ToggleRow from "@/components/notifications/ToggleRow";
import DayChips from "@/components/reminders/DayChips";
import {
  CONTROL, fieldStyle, focusRing, mutedStyle, primaryStyle,
} from "@/lib/notifications/notificationFieldTheme";
import {
  MAX_REMINDER_NAME, MEAL_DELAY_CHOICES, REMINDER_NOTES, REMINDER_TITLES,
  mealDelayLabel, minutesToTimeValue, reminderTimingLine, timeValueToMinutes,
} from "@/lib/reminders/reminderCopy";

/**
 * The detail behind one reminder. Nothing here is a recommendation: the days,
 * the time and the quiet-hours choice are the person's own, saved as shown.
 */
export default function ReminderSheet({ row, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState({ ...row });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timeId = useId();
  const nameId = useId();

  const isCustom = draft.type === "custom";
  const canDelete = isCustom && Boolean(row.id);

  const change = (patch) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const submit = async () => {
    if (isCustom && !String(draft.name || "").trim()) {
      setError("Give this reminder a name first.");
      return;
    }
    // Meal review is not a weekly schedule: it is one prompt attached to one
    // meal, so it never asks for — or validates — a day of the week.
    if (draft.type !== "meal" && !(draft.days || []).length) {
      setError("Choose at least one day.");
      return;
    }
    setPending(true);
    try {
      await onSave(draft);
    } catch {
      setPending(false);
      setError("We could not save that just now. Please try again.");
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setPending(true);
    try {
      await onDelete(draft);
    } catch {
      setPending(false);
      setError("We could not delete that just now. Please try again.");
    }
  };

  return (
    <LogSheetShell
      compact
      open
      onClose={() => { if (!pending) onClose(); }}
      title={REMINDER_TITLES[draft.type] || "Reminder"}
      titleStyle={{ fontFamily: "'Fraunces', Georgia, 'Times New Roman', serif", fontSize: 20 }}
      footer={
        <div className="flex items-center justify-between gap-3">
          {canDelete ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className={`min-h-11 rounded-full px-3 text-sm font-medium active:opacity-60 disabled:opacity-50 ${focusRing}`}
              style={{ color: CONTROL.rust }}
            >
              {confirmDelete ? "Delete this reminder" : "Delete"}
            </button>
          ) : <span aria-hidden="true" />}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className={`min-h-11 rounded-full px-6 py-3 text-sm font-semibold active:opacity-80 disabled:opacity-60 ${focusRing}`}
            style={primaryStyle}
          >
            {pending ? "Saving…" : "Done"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 pt-2">
        {draft.type === "meal" ? (
          <p className="text-base font-medium" style={{ color: CONTROL.ink }}>{mealDelayLabel(draft.delay_minutes)}</p>
        ) : (
          <p className="text-sm" style={mutedStyle}>{reminderTimingLine(draft)}</p>
        )}

        {isCustom && (
          <div>
            <label htmlFor={nameId} className="block pb-2 text-sm" style={{ color: CONTROL.ink }}>Name</label>
            <input
              id={nameId}
              type="text"
              value={draft.name || ""}
              maxLength={MAX_REMINDER_NAME}
              placeholder="Name this reminder"
              disabled={pending}
              onChange={(event) => change({ name: event.target.value })}
              className="min-h-11 w-full rounded-xl px-3 text-base outline-none"
              style={fieldStyle}
            />
          </div>
        )}

        {draft.type === "meal" ? (
          <ChoiceRow
            options={MEAL_DELAY_CHOICES.map((minutes) => ({
              value: minutes,
              label: minutes === 90 ? "90 minutes" : minutes === 120 ? "2 hours" : "3 hours",
            }))}
            value={draft.delay_minutes}
            disabled={pending}
            onChange={(minutes) => change({ delay_minutes: Number(minutes) })}
          />
        ) : (
          <>
            <DayChips value={draft.days} onChange={(days) => change({ days })} disabled={pending} />
            <div>
              <label htmlFor={timeId} className="block pb-2 text-sm" style={{ color: CONTROL.ink }}>Time</label>
              <input
                id={timeId}
                type="time"
                value={minutesToTimeValue(draft.time_minutes)}
                disabled={pending}
                onChange={(event) => {
                  const minutes = timeValueToMinutes(event.target.value);
                  if (minutes != null) change({ time_minutes: minutes });
                }}
                className="min-h-11 w-full rounded-xl px-3 text-base outline-none"
                style={fieldStyle}
              />
            </div>
          </>
        )}

        <ToggleRow
          label="Skip during quiet hours"
          checked={draft.skip_quiet !== false}
          disabled={pending}
          onChange={(value) => change({ skip_quiet: value })}
        />

        {draft.type === "meal" ? (
          <p className="text-xs leading-relaxed" style={mutedStyle}>{REMINDER_NOTES.meal}</p>
        ) : draft.type === "basal" ? (
          <p className="text-xs leading-relaxed" style={mutedStyle}>{REMINDER_NOTES.basal}</p>
        ) : null}

        {error && <p role="alert" className="text-sm" style={{ color: "#9c3f2e" }}>{error}</p>}
      </div>
    </LogSheetShell>
  );
}