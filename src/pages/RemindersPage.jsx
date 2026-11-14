import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import BackButton from "@/components/navigation/BackButton";
import ReminderCard from "@/components/reminders/ReminderCard";
import ReminderRow from "@/components/reminders/ReminderRow";
import ReminderSheet from "@/components/reminders/ReminderSheet";
import { CONTROL } from "@/lib/notifications/notificationFieldTheme";
import {
  deleteReminder, loadReminders, remindersKey, saveReminder, toggleReminder,
} from "@/lib/reminders/reminderApi";
import {
  DEFAULT_ROWS, MAX_CUSTOM_REMINDERS, REMINDER_NOTES,
  reminderPayloadFrom, reminderTimingLine,
} from "@/lib/reminders/reminderCopy";

/**
 * Reminders the person sets themselves: a basal log, a meal review, and up to
 * three of their own. Each row is a switch, a name and the exact timing, and
 * tapping it opens a sheet rather than a new page.
 *
 * The sensor session prompts are not here on purpose: they arrive on their own
 * and cannot be changed, so the page only says so.
 */
export default function RemindersPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: remindersKey(user?.id),
    queryFn: loadReminders,
    enabled: Boolean(user?.id),
  });

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  const saved = Array.isArray(data) ? data : [];

  const withDefaults = (type, record) => ({
    ...DEFAULT_ROWS[type],
    ...(record || {}),
    key: record?.id || type,
    id: record?.id,
  });

  const basalRow = withDefaults("basal", saved.find((row) => row.type === "basal"));
  const mealRow = withDefaults("meal", saved.find((row) => row.type === "meal"));
  const customRows = saved.filter((row) => row.type === "custom").map((row) => withDefaults("custom", row));

  const [pendingKey, setPendingKey] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);

  const onToggle = async (row, next) => {
    setError(null);
    setPendingKey(row.key);
    try {
      if (row.id) await toggleReminder(row.id, next);
      else await saveReminder(reminderPayloadFrom({ ...row, enabled: next }, timezone));
      await refetch();
    } catch {
      setError("We could not save that just now. Please try again.");
    } finally {
      setPendingKey(null);
    }
  };

  const onSaveSheet = async (draft) => {
    const payload = reminderPayloadFrom(draft, timezone);
    if (draft.id) payload.id = draft.id;
    await saveReminder(payload);
    await refetch();
    setSheet(null);
  };

  const onDeleteSheet = async (draft) => {
    await deleteReminder(draft.id);
    await refetch();
    setSheet(null);
  };

  const newCustom = { ...DEFAULT_ROWS.custom, key: "new" };

  return (
    <div className="mx-auto w-full min-w-0 max-w-md space-y-4 break-words pb-[calc(3rem+env(safe-area-inset-bottom))] pt-2">
      <div>
        <div className="flex items-center gap-2 px-1 pb-1">
          <BackButton
            fallback="/settings/notifications"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition"
            style={{ color: "#f7f1e8" }}
          />
          <h1 className="text-lg font-semibold" style={{ color: "#f7f1e8" }}>Reminders</h1>
        </div>
        <p className="px-1 text-xs leading-relaxed" style={{ color: "#dde5e8" }}>
          Prompts you set yourself. Never advice.
        </p>
      </div>

      {isError && (
        <ReminderCard>
          <p className="text-sm" style={{ color: CONTROL.ink }}>We could not load your reminders just now.</p>
          <button type="button" onClick={() => refetch()} className="mt-2 text-xs font-semibold underline" style={{ color: CONTROL.rust }}>
            Try again
          </button>
        </ReminderCard>
      )}

      {isLoading && !isError && (
        <ReminderCard>
          <p className="text-sm" style={{ color: CONTROL.muted }}>Opening your reminders…</p>
        </ReminderCard>
      )}

      {!isLoading && !isError && (
        <ReminderCard title="Your reminders">
          <ReminderRow
            name="Basal log"
            timing={reminderTimingLine(basalRow)}
            checked={basalRow.enabled === true}
            pending={pendingKey === basalRow.key}
            onToggle={(next) => onToggle(basalRow, next)}
            onOpen={() => setSheet(basalRow)}
          />
          <ReminderRow
            name="Meal review"
            timing={reminderTimingLine(mealRow)}
            checked={mealRow.enabled === true}
            pending={pendingKey === mealRow.key}
            onToggle={(next) => onToggle(mealRow, next)}
            onOpen={() => setSheet(mealRow)}
          />
          {customRows.map((row) => (
            <ReminderRow
              key={row.key}
              name={row.name}
              timing={reminderTimingLine(row)}
              checked={row.enabled === true}
              pending={pendingKey === row.key}
              onToggle={(next) => onToggle(row, next)}
              onOpen={() => setSheet(row)}
            />
          ))}

          {customRows.length < MAX_CUSTOM_REMINDERS ? (
            <button
              type="button"
              onClick={() => setSheet(newCustom)}
              className="mt-1 flex min-h-11 w-full items-center text-left text-sm font-medium active:opacity-60"
              style={{ borderTop: `1px solid ${CONTROL.hairline}`, color: CONTROL.ink }}
            >
              + Add reminder
            </button>
          ) : (
            <p className="mt-1 py-3 text-xs" style={{ borderTop: `1px solid ${CONTROL.hairline}`, color: CONTROL.muted }}>
              Three custom reminders, the maximum
            </p>
          )}
        </ReminderCard>
      )}

      {error && (
        <p role="alert" className="px-1 text-sm" style={{ color: "#f7f1e8" }}>{error}</p>
      )}

      <p className="px-1 text-xs leading-relaxed" style={{ color: "#dde5e8" }}>
        {REMINDER_NOTES.sensor}
      </p>

      {sheet && (
        <ReminderSheet
          row={sheet}
          onClose={() => setSheet(null)}
          onSave={onSaveSheet}
          onDelete={onDeleteSheet}
        />
      )}
    </div>
  );
}