import { useQuery } from "@tanstack/react-query";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";
import { useAuth } from "@/lib/AuthContext";
import { loadReminders, remindersKey } from "@/lib/reminders/reminderApi";
import { reminderCountLabel } from "@/lib/reminders/reminderCopy";

/**
 * The last row on the notifications page: how many reminders are on, and the
 * way into the page where they are set. It shares the reminders query with that
 * page, so a switch flipped there is reflected here at once.
 */
export default function RemindersLinkRow() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: remindersKey(user?.id),
    queryFn: loadReminders,
    enabled: Boolean(user?.id),
  });

  return (
    <SectionCard>
      <LedgerRow
        label="Reminders"
        value={Array.isArray(data) ? reminderCountLabel(data) : ""}
        to="/settings/notifications/reminders"
      />
    </SectionCard>
  );
}