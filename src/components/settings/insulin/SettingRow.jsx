import { ChevronRight } from "lucide-react";

/**
 * Apple Health-style quiet settings row.
 * Label (16px, left) · value (15px, secondary gray, right) · chevron (far right).
 * Height 52–56px. Tapping opens a bottom sheet for editing — values are never
 * edited inline on the page.
 */
export default function SettingRow({ label, value, onPress }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex w-full items-center justify-between gap-3 px-4 text-left transition-colors active:opacity-70"
      style={{ minHeight: 54 }}
    >
      <span className="text-base font-normal" style={{ color: "#3f3830" }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[15px] tabular-nums" style={{ color: "#5c554b" }}>
          {value}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#5c554b" }} />
      </span>
    </button>
  );
}