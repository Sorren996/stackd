import { CONTROL, focusRing, primaryStyle, secondaryStyle } from "@/lib/notifications/notificationFieldTheme";
import { DAY_CHIPS } from "@/lib/reminders/reminderCopy";

/**
 * Days of the week. A chosen day is rust with cream text; the others are cream
 * fields with a hairline edge. Fixed colours, so nothing turns dark on cream.
 */
export default function DayChips({ value = [], onChange, disabled = false }) {
  const selected = new Set((Array.isArray(value) ? value : []).map(Number));
  const toggle = (day) => {
    const next = new Set(selected);
    if (next.has(day)) next.delete(day); else next.add(day);
    onChange([...next].sort((a, b) => a - b));
  };

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="pb-2 text-sm" style={{ color: CONTROL.ink }}>Days</legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
        {DAY_CHIPS.map((day) => {
          const on = selected.has(day.value);
          return (
            <button
              key={day.value}
              type="button"
              onClick={() => toggle(day.value)}
              disabled={disabled}
              aria-pressed={on}
              aria-label={day.name}
              className={`h-11 w-11 rounded-full border text-sm font-medium disabled:opacity-50 ${focusRing}`}
              style={on ? primaryStyle : secondaryStyle}
            >
              {day.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}