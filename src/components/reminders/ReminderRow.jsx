import { Switch } from "@/components/ui/switch";
import { CONTROL, switchThumbClass, switchTrackClass } from "@/lib/notifications/notificationFieldTheme";

/**
 * One reminder: its switch, its name and the one timing line that says exactly
 * when it arrives. Tapping the row (not the switch) opens the sheet where the
 * days, time or name are set.
 */
export default function ReminderRow({ name, timing, checked, pending = false, onToggle, onOpen }) {
  return (
    <div className="flex items-center gap-3 py-3" style={{ borderTop: `1px solid ${CONTROL.hairline}` }}>
      <Switch
        checked={checked}
        onCheckedChange={(next) => onToggle(next)}
        disabled={pending}
        aria-label={name}
        aria-busy={pending}
        thumbClassName={switchThumbClass}
        className={`shrink-0 ${switchTrackClass}`}
      />
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className="min-w-0 flex-1 text-left active:opacity-60"
      >
        <span className="block text-sm font-medium" style={{ color: CONTROL.ink }}>{name}</span>
        <span className="mt-0.5 block text-xs" style={{ color: CONTROL.muted }}>
          {pending ? "Saving…" : timing}
        </span>
      </button>
      <span aria-hidden="true" className="shrink-0 text-sm" style={{ color: CONTROL.muted }}>›</span>
    </div>
  );
}