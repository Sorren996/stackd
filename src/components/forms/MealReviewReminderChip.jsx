import { BellRing, Undo2 } from "lucide-react";
import { focusRing } from "@/lib/notifications/notificationFieldTheme";
import { formatClockAt, mealReminderPromptLabel } from "@/lib/reminders/reminderCopy";

/**
 * The one place a meal's own review reminder is asked for.
 *
 * It exists only while Meal review is switched on in settings — off means it is
 * absent, not greyed out. It starts unselected on every new meal, and choosing
 * it is a single tap that shows the moment it will arrive. Undo takes it back
 * off, so nothing is ever scheduled by accident.
 */
export default function MealReviewReminderChip({ enabled, delayMinutes, reminderAtMs, armed, onArm, onUndo }) {
  if (!enabled) return null;

  if (armed) {
    const clock = formatClockAt(reminderAtMs);
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl border px-3 py-2"
        style={{ borderColor: "#cbb9a4", background: "#f4ece1" }}>
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium" style={{ color: "#3f3830" }}>
          <BellRing size={15} aria-hidden style={{ color: "#9c5228", flexShrink: 0 }} />
          <span className="truncate">{clock ? `Reminder set for ${clock}` : "Reminder set"}</span>
        </p>
        <button
          type="button"
          onClick={onUndo}
          className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[13px] font-medium active:opacity-60 ${focusRing}`}
          style={{ color: "#9c5228" }}
        >
          <Undo2 size={13} aria-hidden />
          Undo
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onArm}
      className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-full border px-4 text-[13px] font-medium active:opacity-70 ${focusRing}`}
      style={{ borderColor: "#cbb9a4", background: "#fdf9f2", color: "#3f3830" }}
    >
      <BellRing size={15} aria-hidden style={{ color: "#9c5228" }} />
      {mealReminderPromptLabel(delayMinutes)}
    </button>
  );
}