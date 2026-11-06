import { Switch } from "@/components/ui/switch";

/**
 * One labelled switch. The description says what the option does in plain
 * words; nothing here recommends a setting.
 */
export default function ToggleRow({ label, description, checked, onChange, disabled = false, note = null }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" style={{ color: disabled ? "#a89e8d" : "#3f3830" }}>
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "#746959" }}>
            {description}
          </p>
        )}
        {note && (
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "#9c5228" }}>
            {note}
          </p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
    </div>
  );
}