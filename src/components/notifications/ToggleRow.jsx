import { Switch } from "@/components/ui/switch";

/**
 * One labelled switch. The description says what the option does in plain
 * words; nothing here recommends a setting.
 */
export default function ToggleRow({ label, description, checked, onChange, disabled = false, pending = false, note = null }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#746959" }}>
            {description}
          </p>
        )}
        {pending && <span role="status" className="text-xs text-ink-muted">Saving…</span>}
        {note && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#9c5228" }}>
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
        thumbClassName="bg-paper shadow-none duration-100"
        className="relative my-3 shrink-0 shadow-none duration-100 after:absolute after:-inset-y-3 after:-inset-x-1 data-[state=checked]:bg-field data-[state=unchecked]:bg-ink-muted"
      />
    </div>
  );
}