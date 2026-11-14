import { Switch } from "@/components/ui/switch";
import { switchThumbClass, switchTrackClass } from "@/lib/notifications/notificationFieldTheme";

/**
 * One labelled switch. The description says what the option does in plain
 * words; nothing here recommends a setting. Off is a hairline track with a
 * muted thumb, on is the page's rust; the label stays ink either way.
 */
export default function ToggleRow({ label, description, checked, onChange, disabled = false, pending = false, note = null }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: "#2E2420" }}>
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#746959" }}>
            {description}
          </p>
        )}
        {pending && <span role="status" className="text-xs" style={{ color: "#746959" }}>Saving…</span>}
        {note && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#8C4A28" }}>
            {note}
          </p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled || pending}
        aria-label={label}
        aria-busy={pending}
        thumbClassName={switchThumbClass}
        className={`my-3 shrink-0 ${switchTrackClass}`}
      />
    </div>
  );
}