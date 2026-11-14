import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { loadReminders, remindersKey } from "@/lib/reminders/reminderApi";

/**
 * What the Meal review settings row currently says: whether the feature is on
 * and how long its delay is. It schedules nothing — a reminder only exists once
 * a meal asks for one.
 */
export default function useMealReminderSetting() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: remindersKey(user?.id),
    queryFn: loadReminders,
    enabled: Boolean(user?.id),
  });

  const row = Array.isArray(data) ? data.find((item) => item?.type === "meal") : null;
  return {
    enabled: row?.enabled === true,
    delayMinutes: Number(row?.delay_minutes) || 120,
  };
}