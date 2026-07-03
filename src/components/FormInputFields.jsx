import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

function formatTimeLabel(value) {
  const [hoursRaw, minutes = "00"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.padStart(2, "0")} ${suffix}`;
}

function buildTimeValue(hour12, minute, suffix) {
  let hour = Number(hour12) % 12;
  if (suffix === "PM") hour += 12;
  const safeMinute = Math.max(0, Math.min(55, Number(minute) || 0));
  return `${String(hour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function parseTimeValue(value) {
  const [hoursRaw = "0", minutesRaw = "0"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  return {
    hour12: hours % 12 || 12,
    minute: Math.max(0, Math.min(55, Math.floor(Number(minutesRaw) / 5) * 5)),
    suffix: hours >= 12 ? "PM" : "AM",
  };
}

const GLASS_SURFACE = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008))",
  borderColor: "rgba(255,255,255,0.12)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.07)",
};

const GLASS_KEY = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))",
  borderColor: "rgba(255,255,255,0.1)",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.18)",
};

const GLASS_KEY_PRESSED = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.3)",
};

export function CustomInputTray({ open, onClose, title, children, tall = false, anchorRef }) {
  const prevOverflowRef = useRef("");

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    if (anchorRef?.current) {
      anchorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    prevOverflowRef.current = document.body.style.overflow;
    const lockTimeout = setTimeout(() => {
      document.body.style.overflow = "hidden";
    }, 400);

    return () => {
      clearTimeout(lockTimeout);
      document.body.style.overflow = prevOverflowRef.current;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const absorb = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <>
      <div
        className="pointer-events-auto fixed inset-0 z-[998] bg-black/30"
        onPointerDown={absorb}
        onPointerUp={absorb}
        onClick={(event) => {
          absorb(event);
          onClose();
        }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className={`pointer-events-auto fixed inset-x-0 bottom-0 z-[999] overflow-hidden rounded-t-3xl border px-4 pb-[max(env(safe-area-inset-bottom),0.85rem)] pt-3 ${
          tall ? "min-h-[43dvh]" : "min-h-[34dvh]"
        }`}
        style={{
          background: "linear-gradient(160deg, hsl(162,12%,9%) 0%, hsl(162,10%,6%) 100%)",
          borderColor: "rgba(255,255,255,0.12)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-50"
          style={{ background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(45,212,191,0.12), transparent 70%)" }}
        />
        <div className="relative z-10 mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white/60">{title}</p>
          <button
            type="button"
            onClick={(event) => {
              absorb(event);
              onClose();
            }}
            className="rounded-full border px-4 py-1.5 text-sm font-semibold text-teal-200 transition hover:text-white"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            Done
          </button>
        </div>
        <div className="relative z-10">{children}</div>
      </motion.div>
    </>,
    document.body
  );
}

export function TimeScrollField({ label, value, onChange, max }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const parsed = parseTimeValue(value);
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  const updateTime = (patch) => {
    const next = { ...parsed, ...patch };
    const nextValue = buildTimeValue(next.hour12, next.minute, next.suffix);
    onChange(max && nextValue > max ? max : nextValue);
  };

  return (
    <div ref={fieldRef} className="rounded-2xl border p-3" style={GLASS_SURFACE}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between">
        <span className="text-sm text-white/40">{label}</span>
        <span className="text-sm font-semibold text-white">{formatTimeLabel(value)}</span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} anchorRef={fieldRef}>
        <div className="grid h-[27dvh] grid-cols-[1fr_1fr_0.9fr] gap-3">
          {[["hour12", hours], ["minute", minutes]].map(([key, values]) => (
            <div key={key} className="touch-pan-y overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-1" style={{ scrollbarWidth: "none" }}>
              {values.map((item) => {
                const isActive = parsed[key] === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateTime({ [key]: item });
                    }}
                    className={`mb-1 flex h-12 w-full items-center justify-center rounded-xl text-lg font-semibold transition last:mb-0 ${
                      isActive ? "text-white" : "text-white/45 hover:bg-white/10 hover:text-white"
                    }`}
                    style={isActive ? { background: "linear-gradient(145deg, rgba(20,184,166,0.4), rgba(15,118,110,0.3))", boxShadow: "0 0 16px rgba(20,184,166,0.35), inset 0 1px 1px rgba(255,255,255,0.2)" } : undefined}
                  >
                    {String(item).padStart(key === "minute" ? 2 : 1, "0")}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="grid gap-2">
            {["AM", "PM"].map((suffix) => {
              const isActive = parsed.suffix === suffix;
              return (
                <button
                  key={suffix}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTime({ suffix });
                  }}
                  className={`rounded-2xl text-base font-bold transition ${isActive ? "text-white" : "border border-white/10 bg-black/25 text-white/45"}`}
                  style={isActive ? { background: "linear-gradient(145deg, rgba(20,184,166,0.4), rgba(15,118,110,0.3))", boxShadow: "0 0 16px rgba(20,184,166,0.35), inset 0 1px 1px rgba(255,255,255,0.2)" } : undefined}
                >
                  {suffix}
                </button>
              );
            })}
          </div>
        </div>
      </CustomInputTray>
    </div>
  );
}

export function NumberPadField({ label, value, onChange, unit, placeholder = "--", decimal = true, maxLength = 6, large = false }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const textValue = value === undefined || value === null ? "" : String(value);
  const press = (key) => {
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(textValue.slice(0, -1));
    if (key === "." && (!decimal || textValue.includes("."))) return;
    if (textValue.length >= maxLength) return;
    onChange(`${textValue}${key}`);
  };

  return (
    <div ref={fieldRef} className={`rounded-xl border p-3 ${large ? "px-6 py-6" : ""}`} style={GLASS_SURFACE}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3">
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
        <span className={`${large ? "text-5xl" : "text-base"} text-right font-bold text-white`}>
          {textValue || placeholder}{unit && <span className="ml-1 text-xs text-white/35">{unit}</span>}
        </span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} anchorRef={fieldRef}>
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                press(key);
              }}
              className="h-14 rounded-2xl border text-xl font-bold text-white/85 transition active:scale-[0.96]"
              style={GLASS_KEY}
              onMouseDown={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, GLASS_KEY_PRESSED); }}
              onMouseUp={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, GLASS_KEY); }}
              onMouseLeave={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, GLASS_KEY); }}
            >
              {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
            </button>
          ))}
        </div>
      </CustomInputTray>
    </div>
  );
}

export function TextPadField({ label, value, onChange, placeholder, multiline = false }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const rows = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const add = (key) => onChange(`${value || ""}${key}`);

  return (
    <div ref={fieldRef}>
      {label && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`w-full rounded-2xl border px-3 py-3 text-left text-sm text-white outline-none transition ${multiline ? "min-h-20" : ""}`}
        style={GLASS_SURFACE}
      >
        {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-white/30">{placeholder}</span>}
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label || "Text"} tall anchorRef={fieldRef}>
        <div className="rounded-2xl border border-white/10 bg-black/25 p-2">
          {rows.map((row) => (
            <div key={row} className="mb-1.5 flex justify-center gap-1.5 last:mb-0">
              {[...row].map((letter) => (
                <button key={letter} type="button" onClick={(event) => {
                    event.stopPropagation();
                    add(letter.toLowerCase());
                  }} className="h-12 min-w-0 flex-1 rounded-xl border text-sm font-bold text-white/85 active:scale-[0.96]" style={GLASS_KEY}>
                  {letter}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-2 grid grid-cols-[1fr_1fr_2fr_1fr_1fr] gap-2">
            <button type="button" onClick={(event) => { event.stopPropagation(); onChange(""); }} className="h-12 rounded-xl border text-xs font-bold text-white/65" style={GLASS_KEY}>Clear</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); add(","); }} className="h-12 rounded-xl border text-xs font-bold text-white/65" style={GLASS_KEY}>,</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); add(" "); }} className="h-12 rounded-xl border text-xs font-bold text-white/65" style={GLASS_KEY}>Space</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); add("."); }} className="h-12 rounded-xl border text-xs font-bold text-white/65" style={GLASS_KEY}>.</button>
            <button type="button" onClick={(event) => { event.stopPropagation(); onChange(String(value || "").slice(0, -1)); }} className="h-12 rounded-xl border text-xs font-bold text-white/65" style={GLASS_KEY}>Back</button>
          </div>
        </div>
      </CustomInputTray>
    </div>
  );
}

export function SelectField({ label, value, onChange, options, placeholder = "Select" }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const selected = options.find((option) => option.value === value);

  return (
    <div ref={fieldRef} className="rounded-xl border p-3" style={GLASS_SURFACE}>
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
        <span className="min-w-0 text-right text-sm font-semibold text-white">
          {selected ? selected.label : <span className="text-white/30">{placeholder}</span>}
        </span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} tall anchorRef={fieldRef}>
        <div
          className="h-[36dvh] overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-1"
          style={{ scrollbarWidth: "none", touchAction: "pan-y" }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(option.value);
                  setOpen(false);
                }}
                className="mb-1 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition last:mb-0"
                style={
                  isSelected
                    ? { borderColor: "rgba(20,184,166,0.5)", background: "linear-gradient(145deg, rgba(20,184,166,0.18), rgba(20,184,166,0.06))", boxShadow: "0 0 18px rgba(20,184,166,0.2), inset 0 1px 1px rgba(255,255,255,0.1)" }
                    : { borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }
                }
              >
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${isSelected ? "text-white" : "text-white/55"}`}>{option.label}</span>
                  {option.description && <span className="text-[10px] uppercase tracking-wider text-white/30">{option.description}</span>}
                </span>
                <span className={`h-3 w-3 rounded-full ${isSelected ? "bg-teal-300" : "bg-white/15"}`} />
              </button>
            );
          })}
        </div>
      </CustomInputTray>
    </div>
  );
}