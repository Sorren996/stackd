import { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";
import { isBasalInsulinType } from "@/lib/insulinPharmacology";

// ── Field component kit for the shared log/edit forms ─────────────────────
// Native-feel inputs with locked spacing enforced by the shell (20px side
// padding, 48px+ touch targets, 16px gaps between field blocks).
//
// Palette: cream cards, copper accent, espresso ink, taupe/faint muted labels,
// sage for rescue/estimate accents (all WCAG AA ≥ 4.5:1 on cream).

const INK = "#3f3830";
const COPPER = "#9c5228";
const SAGE = "#5b6550";
const TAUPE = "#6b6153";
const FAINT = "#746959";
const CREAM = "#fdf9f2";
const CANVAS = "#f7f1e8";
const HAIRLINE = "#eadccf";

// Protein/Fat Low/Med/High → grams feeding the existing hasDelayedRise detector.
// High fat (45g) ≥ 40 triggers delayed-rise; High protein (45g) ≥ 30 with carbs.
export const MACRO_GRAMS = { low: 0, med: 20, high: 45 };

function FieldLabel({ children, sub }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          fontWeight: 700,
          fontSize: "10px",
          color: FAINT,
        }}
      >
        {children}
      </span>
      {sub && (
        <span style={{ fontSize: "11px", color: FAINT, fontWeight: 400 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ── Tap-to-type stepper ───────────────────────────────────────────────────
// −/+ buttons in 1u (or 5g) steps. The big number is an <input> so tapping it
// lets the user type an exact value like 2.4u. Pills are one-tap set values.
// Pills are ALWAYS static — they never reference past meals, doses, or estimates.
export function TapStepper({ label, sub, value, onChange, unit, step = 1, presets = [], min = 0 }) {
  const current = Number(value) || 0;
  const set = (next) => {
    const clamped = Math.max(min, next);
    onChange(clamped > 0 ? String(clamped) : "");
  };

  return (
    <div>
      {label && <div className="mb-1.5"><FieldLabel sub={sub}>{label}</FieldLabel></div>}
      <div className="flex items-center justify-between" style={{ height: "56px" }}>
        <button
          type="button"
          onClick={() => set(current - step)}
          disabled={current <= min}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 disabled:opacity-30"
          style={{ background: CANVAS, color: INK }}
          aria-label={`Decrease by ${step}`}
        >
          <Minus className="h-5 w-5" />
        </button>

        <div className="flex min-w-[110px] items-baseline justify-center gap-1">
          <input
            type="text"
            inputMode={step >= 1 ? "numeric" : "decimal"}
            value={value}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, "");
              onChange(raw);
            }}
            onBlur={() => {
              const n = Number(value);
              if (!Number.isFinite(n) || n < min) onChange("");
              else if (n > min) onChange(String(n));
              else onChange("");
            }}
            placeholder="0"
            className="w-[72px] bg-transparent text-center text-4xl font-light leading-none outline-none"
            style={{ color: INK, fontVariantNumeric: "tabular-nums" }}
            aria-label={label || "Value"}
          />
          {unit && <span className="text-sm font-medium" style={{ color: FAINT }}>{unit}</span>}
        </div>

        <button
          type="button"
          onClick={() => set(current + step)}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95"
          style={{ background: CANVAS, color: INK }}
          aria-label={`Increase by ${step}`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {presets.length > 0 && (
        <div className="mt-2.5 flex justify-center gap-2">
          {presets.map((preset) => {
            const isSelected = current === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => set(preset)}
                className="flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  height: 44,
                  minWidth: 56,
                  transition: "background 200ms ease-out, color 200ms ease-out",
                  background: isSelected ? COPPER : CANVAS,
                  color: isSelected ? CREAM : TAUPE,
                }}
                aria-pressed={isSelected}
              >
                {preset}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Compact segmented control ─────────────────────────────────────────────
// For "A meal | Correction" and "Custom meal | AI estimate". Selected = copper.
export function CompactSegmented({ value, onChange, options, ariaLabel }) {
  return (
    <div
      className="inline-flex rounded-full p-1"
      style={{ background: CANVAS }}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="rounded-full text-sm font-semibold transition"
            style={{
              height: 40,
              padding: "0 18px",
              transition: "background 200ms ease-out, color 200ms ease-out",
              background: isSelected ? COPPER : "transparent",
              color: isSelected ? CREAM : TAUPE,
            }}
            aria-pressed={isSelected}
            aria-label={ariaLabel ? `${ariaLabel}: ${opt.label}` : opt.label}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Triple segmented — Low / Medium / High (protein & fat) ─────────────────
export function TripleSegmented({ label, value, onChange }) {
  const opts = [
    { value: "low", label: "Low" },
    { value: "med", label: "Medium" },
    { value: "high", label: "High" },
  ];
  return (
    <div>
      {label && <div className="mb-1.5"><FieldLabel>{label}</FieldLabel></div>}
      <div className="flex gap-2">
        {opts.map((opt) => {
          const isSelected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="flex-1 rounded-full text-sm font-semibold transition"
              style={{
                height: 44,
                transition: "background 200ms ease-out, color 200ms ease-out",
                background: isSelected ? COPPER : CANVAS,
                color: isSelected ? CREAM : TAUPE,
              }}
              aria-pressed={isSelected}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Insulin chips — only from the user's settings, with fast/basal labels ──
// Selecting a basal hides the meal/correction row (the form decides). Each
// chip shows the insulin name + a small italic category label.
export function InsulinChips({ value, onChange, options, ariaLabel }) {
  if (!options.length) {
    return (
      <div>
        <div className="mb-1.5"><FieldLabel sub="· only from your settings">Insulin</FieldLabel></div>
        <p className="mt-2 text-xs" style={{ color: FAINT }}>
          Add insulins in Settings to log a dose.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5"><FieldLabel sub="· only from your settings">Insulin</FieldLabel></div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isSelected = opt.value === value;
          const basal = isBasalInsulinType(opt.value);
          const tag = basal ? "basal" : "fast-acting";
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="flex items-center gap-1.5 rounded-full text-sm font-semibold transition"
              style={{
                height: 44,
                padding: "0 16px",
                transition: "background 200ms ease-out, color 200ms ease-out",
                background: isSelected ? COPPER : CANVAS,
                color: isSelected ? CREAM : INK,
              }}
              aria-pressed={isSelected}
              aria-label={ariaLabel ? `${ariaLabel}: ${opt.label}` : opt.label}
            >
              {opt.label}
              <em style={{ fontSize: "11px", fontWeight: 400, fontStyle: "italic", opacity: 0.7 }}>
                {tag}
              </em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Rescue-carb chip — single tap toggle, sage accent ──────────────────────
export function RescueChip({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 rounded-full text-sm font-semibold transition"
      style={{
        height: 44,
        padding: "0 18px",
        transition: "background 200ms ease-out, color 200ms ease-out",
        background: checked ? SAGE : CANVAS,
        color: checked ? CREAM : TAUPE,
      }}
      aria-pressed={checked}
    >
      Rescue carbs
    </button>
  );
}

// ── Now-time field — "Now" chip toggles to native time input ───────────────
// Defaults to now. Tapping "Now" keeps it at the current moment; tapping the
// chip a second time (or the input) reveals a native time picker.
export function NowTimeField({ dateValue, timeValue, onDateChange, onTimeChange, maxDate, maxTime }) {
  const setNow = () => {
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    onDateChange(d);
    onTimeChange(t);
  };

  const inputStyle = {
    height: "44px",
    background: CANVAS,
    color: INK,
    border: "none",
    outline: "none",
    borderRadius: "9999px",
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={setNow}
        className="flex h-11 items-center rounded-full px-4 text-sm font-semibold transition active:scale-95"
        style={{ background: "rgba(156,82,40,0.12)", color: COPPER }}
      >
        Now
      </button>
      <input
        type="date"
        value={dateValue}
        max={maxDate}
        onChange={(e) => onDateChange(e.target.value)}
        className="rounded-full px-3 text-sm font-medium"
        style={inputStyle}
      />
      <input
        type="time"
        value={timeValue}
        max={maxTime}
        onChange={(e) => onTimeChange(e.target.value)}
        className="rounded-full px-3 text-sm font-medium"
        style={inputStyle}
      />
    </div>
  );
}

// ── Collapsible note field ─────────────────────────────────────────────────
export function CollapsibleNote({ value, onChange, placeholder = "Note" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (value) setOpen(true);
  }, [value]);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium"
        style={{ color: COPPER }}
      >
        Add note (optional)
      </button>
    );
  }
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full rounded-2xl px-4 pt-3 text-base font-medium"
      style={{ background: CANVAS, color: INK, border: "none", outline: "none", resize: "none", minHeight: "56px" }}
    />
  );
}

// ── Large −/+ numeric stepper ──────────────────────────────────────────────
// Locked 56px field height, large central value, − / + buttons. Optional
// `unit` suffix and `step` (default 1). Presets row optional via `presets`.
export function StepperField({ label, value, onChange, unit, step = 1, presets, min = 0 }) {
  const current = Number(value) || 0;
  const set = (next) => {
    const clamped = Math.max(min, next);
    onChange(clamped > 0 ? String(clamped) : "");
  };

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div
        className="flex items-center justify-between"
        style={{ height: "56px", marginTop: label ? "10px" : 0 }}
      >
        <button
          type="button"
          onClick={() => set(current - step)}
          disabled={current <= min}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 disabled:opacity-30"
          style={{ background: CANVAS, color: INK }}
          aria-label={`Decrease ${label || "value"} by ${step}`}
        >
          <Minus className="h-5 w-5" />
        </button>

        <div className="flex min-w-[100px] items-baseline justify-center gap-1">
          <span className="text-4xl font-black leading-none" style={{ color: INK, fontVariantNumeric: "tabular-nums" }}>
            {current}
          </span>
          {unit && <span className="text-sm font-medium" style={{ color: FAINT }}>{unit}</span>}
        </div>

        <button
          type="button"
          onClick={() => set(current + step)}
          className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95"
          style={{ background: CANVAS, color: INK }}
          aria-label={`Increase ${label || "value"} by ${step}`}
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {presets && presets.length > 0 && (
        <div className="no-scrollbar mt-4" style={{ overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
          <div className="flex justify-center gap-2">
            {presets.map((preset) => {
              const isSelected = current === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => set(preset)}
                  className="flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{
                    height: 44,
                    minWidth: 56,
                    transition: "background 200ms ease-out, color 200ms ease-out",
                    background: isSelected ? COPPER : CANVAS,
                    color: isSelected ? CREAM : TAUPE,
                  }}
                  aria-pressed={isSelected}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Segmented control — for type choices (insulin types, etc.) ─────────────
// Renders a horizontal scroll of segments; selected = copper. Each segment
// shows an optional color dot (for insulin profiles) + label.
export function SegmentedControl({ label, value, onChange, options, ariaLabel }) {
  if (!options.length) {
    return (
      <div>
        {label && <FieldLabel>{label}</FieldLabel>}
        <p className="mt-2 text-xs" style={{ color: FAINT }}>
          Add types in Settings to log an entry.
        </p>
      </div>
    );
  }

  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <div
        className="no-scrollbar"
        style={{
          marginTop: label ? "10px" : 0,
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
          overscrollBehaviorX: "contain",
        }}
      >
        <div className="flex gap-2">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                className="flex shrink-0 items-center gap-2 rounded-full text-sm font-semibold"
                style={{
                  height: "44px",
                  padding: "0 16px",
                  transition: "background 200ms ease-out, color 200ms ease-out",
                  background: isSelected ? COPPER : CANVAS,
                  color: isSelected ? CREAM : TAUPE,
                }}
                aria-pressed={isSelected}
                aria-label={ariaLabel ? `${ariaLabel}: ${option.label}` : option.label}
              >
                {option.color && (
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "9999px",
                      background: option.color,
                      boxShadow: isSelected ? "0 0 0 2px rgba(247,241,232,0.85)" : "0 0 0 1px rgba(63,56,48,0.10)",
                    }}
                  />
                )}
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Time field with a "Now" shortcut chip ──────────────────────────────────
// Combines a native date input + native time input, plus a "Now" chip that
// snaps both to the current moment. 56px row height.
export function TimeField({ dateLabel = "Date", timeLabel = "Time", dateValue, timeValue, onDateChange, onTimeChange, maxDate, maxTime }) {
  const setNow = () => {
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    onDateChange(d);
    onTimeChange(t);
  };

  const inputClass = "w-full rounded-2xl px-4 text-base font-medium";
  const inputStyle = {
    height: "56px",
    background: CANVAS,
    color: INK,
    border: "none",
    outline: "none",
  };

  return (
    <div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <FieldLabel>{dateLabel}</FieldLabel>
          <input
            type="date"
            value={dateValue}
            max={maxDate}
            onChange={(e) => onDateChange(e.target.value)}
            className={`${inputClass} mt-2`}
            style={inputStyle}
          />
        </div>
        <div className="flex-1">
          <FieldLabel>{timeLabel}</FieldLabel>
          <input
            type="time"
            value={timeValue}
            max={maxTime}
            onChange={(e) => onTimeChange(e.target.value)}
            className={`${inputClass} mt-2`}
            style={inputStyle}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={setNow}
        className="mt-3 flex items-center gap-1.5 rounded-full px-4 text-xs font-semibold"
        style={{ height: "36px", background: "rgba(156,82,40,0.12)", color: COPPER }}
      >
        Now
      </button>
    </div>
  );
}

// ── Text field — optional notes / name ─────────────────────────────────────
// Single-line or multiline, 56px height (multiline grows).
export function TextField({ label, value, onChange, placeholder, multiline = false }) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className="w-full rounded-2xl px-4 pt-3.5 text-base font-medium"
          style={{
            marginTop: label ? "10px" : 0,
            background: CANVAS,
            color: INK,
            border: "none",
            outline: "none",
            resize: "none",
            minHeight: "56px",
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-2xl px-4 text-base font-medium"
          style={{
            height: "56px",
            marginTop: label ? "10px" : 0,
            background: CANVAS,
            color: INK,
            border: "none",
            outline: "none",
          }}
        />
      )}
    </div>
  );
}

// ── Rescue-carbs toggle — for the meal form ───────────────────────────────
export function RescueCarbToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-2xl px-4"
      style={{ height: "56px", background: CANVAS }}
      aria-pressed={checked}
    >
      <span className="text-sm font-medium" style={{ color: INK }}>
        Rescue carbs
      </span>
      <span
        className="flex items-center justify-center rounded-full transition"
        style={{
          width: "48px",
          height: "28px",
          background: checked ? COPPER : "#d8cec2",
          transition: "background 200ms ease-out",
        }}
      >
        <span
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "9999px",
            background: CREAM,
            transform: checked ? "translateX(11px)" : "translateX(-11px)",
            transition: "transform 200ms ease-out",
          }}
        />
      </span>
    </button>
  );
}

export { FieldLabel, INK, COPPER, SAGE, TAUPE, FAINT, CREAM, CANVAS, HAIRLINE };