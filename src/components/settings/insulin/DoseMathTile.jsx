import { useState, useRef } from "react";
import { CustomInputTray } from "@/components/settings/insulin/NumberPadField";

/**
 * Stat-tile-style dose math setting: plain-language name, big legible value,
 * unit, and one helper line. The value is the primary visual; the number pad
 * opens on tap (input is secondary).
 *
 * Inspired by the day-view stat tiles — reads like a summary, not a form.
 */
export default function DoseMathTile({
  plainLabel,
  technicalLabel,
  value,
  unit,
  helper,
  onChange,
  padTitle,
  decimal = false,
  maxLength = 3,
}) {
  const [open, setOpen] = useState(false);
  const tileRef = useRef(null);
  const textValue = value === undefined || value === null ? "" : String(value);

  const press = (key) => {
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(textValue.slice(0, -1));
    if (key === "." && (!decimal || textValue.includes("."))) return;
    if (textValue.length >= maxLength) return;
    onChange(`${textValue}${key}`);
  };

  return (
    <div ref={tileRef} className="space-y-2">
      <div>
        <p className="text-sm font-semibold leading-tight" style={{ color: "#3f3830" }}>{plainLabel}</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-wider" style={{ color: "#746959" }}>{technicalLabel}</p>
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-baseline gap-2 rounded-2xl px-1 py-1 text-left transition hover:opacity-70"
      >
        <span className="text-3xl font-light tabular-nums leading-none" style={{ color: textValue ? "#3f3830" : "#b8aea0" }}>
          {textValue || "--"}
        </span>
        {unit && <span className="text-xs font-medium" style={{ color: "#746959" }}>{unit}</span>}
      </button>

      {helper && (
        <p className="text-[11px] leading-relaxed" style={{ color: "#746959" }}>{helper}</p>
      )}

      <CustomInputTray open={open} onClose={() => setOpen(false)} title={padTitle || technicalLabel} anchorRef={tileRef}>
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                press(key);
              }}
              className="h-14 rounded-2xl border text-xl font-bold transition active:scale-[0.98]"
              style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#3f3830" }}
            >
              {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
            </button>
          ))}
        </div>
      </CustomInputTray>
    </div>
  );
}