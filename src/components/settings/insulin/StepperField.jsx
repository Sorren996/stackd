import { Minus, Plus } from "lucide-react";

/**
 * A native-oriented number field with +/− steppers.
 *
 * Uses a real <input type="number"> so mobile browsers show the numeric
 * keyboard, with 44px stepper buttons and a visible focus state. Values are
 * emitted as strings (the caller owns parsing/storage), matching the app's
 * existing settings handlers.
 */
export default function StepperField({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min = 0,
  decimal = false,
  maxLength = 6,
}) {
  const textValue = value === undefined || value === null ? "" : String(value);
  const num = textValue === "" ? NaN : Number(textValue);

  const emit = (next) => onChange(decimal ? String(next) : String(Math.round(next)));

  const stepBy = (dir) => {
    const base = Number.isFinite(num) ? num : 0;
    const next = decimal ? Math.round((base + dir * step) * 100) / 100 : base + dir * step;
    if (next < min) return emit(min);
    emit(next);
  };

  const handleNative = (e) => {
    let next = e.target.value;
    if (!decimal) next = next.replace(/[^\d]/g, "");
    else if (!/^\d*\.?\d*$/.test(next)) return;
    if (next.length > maxLength) return;
    onChange(next);
  };

  return (
    <div className="flex h-12 w-full items-center justify-between gap-2 rounded-xl px-1 py-1.5">
      <div className="flex items-center gap-3 rounded-xl" style={{ background: "#f7f1e8", border: "1px solid #eadccf" }}>
        <button
          type="button"
          onClick={() => stepBy(-1)}
          aria-label={`Decrease ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-l-xl transition active:scale-[0.96]"
          style={{ color: "#3f3830" }}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="flex items-baseline gap-1 focus-within:ring-2 focus-within:ring-copper/50 rounded-md">
          <input
            type="number"
            inputMode={decimal ? "decimal" : "numeric"}
            value={textValue}
            onChange={handleNative}
            placeholder="--"
            aria-label={label}
            className="w-20 bg-transparent text-center text-base font-bold tabular-nums focus:outline-none"
            style={{ color: "#3f3830" }}
          />
          {unit && <span className="shrink-0 text-xs font-medium" style={{ color: "#5a5048" }}>{unit}</span>}
        </div>
        <button
          type="button"
          onClick={() => stepBy(1)}
          aria-label={`Increase ${label}`}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-r-xl transition active:scale-[0.96]"
          style={{ color: "#3f3830" }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}