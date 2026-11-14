import { ChevronRight } from "lucide-react";

/**
 * Apple Health-style quiet settings row.
 * Label (16px, left) · value (15px, secondary gray, right) · chevron (far right).
 * Height 52–56px. Tapping opens a bottom sheet for editing — values are never
 * edited inline on the page.
 *
 * `info` sits beside the label as its own 44px control (for example an
 * explanation trigger). It is a sibling of the row's buttons, not a button
 * nested inside one, and it never opens the editor.
 */
export default function SettingRow({ label, value, onPress, info }) {
  return (
    <div className="flex w-full items-center justify-between gap-2 px-4" style={{ minHeight: 54 }}>
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={onPress}
          className="min-w-0 truncate text-left text-base font-normal transition-opacity active:opacity-70"
          style={{ color: "#3f3830" }}
        >
          {label}
        </button>
        {info}
      </div>
      <button
        type="button"
        onClick={onPress}
        aria-label={`Edit ${label}`}
        className="flex shrink-0 items-center gap-2 py-3 transition-opacity active:opacity-70"
      >
        {value && (
          <span className="text-[15px] tabular-nums" style={{ color: "#5c554b" }}>
            {value}
          </span>
        )}
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#5c554b" }} />
      </button>
    </div>
  );
}