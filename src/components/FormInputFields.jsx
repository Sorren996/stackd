import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Delete, ArrowLeft } from "lucide-react";

function formatTimeLabel(value) {
  const [hoursRaw, minutes = "00"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${minutes.padStart(2, "0")} ${suffix}`;
}

function buildTimeValue(hour12, minute, suffix) {
  let hour = Number(hour12) % 12;
  if (suffix === "PM") hour += 12;
  const safeMinute = Math.max(0, Math.min(59, Number(minute) || 0));
  return `${String(hour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function parseTimeValue(value) {
  const [hoursRaw = "0", minutesRaw = "0"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  return {
    hour12: hours % 12 || 12,
    minute: Math.max(0, Math.min(59, Number(minutesRaw) || 0)),
    suffix: hours >= 12 ? "PM" : "AM",
  };
}

const GLASS_SURFACE = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012))",
  borderColor: "rgba(255,255,255,0.14)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.1)",
};

const GLASS_KEY = {
  background: "linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.035))",
  borderColor: "rgba(255,255,255,0.12)",
  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), 0 2px 6px rgba(0,0,0,0.18)",
};

const GLASS_KEY_PRESSED = {
  background: "linear-gradient(145deg, rgba(91,168,138,0.35), rgba(91,168,138,0.12))",
  borderColor: "rgba(91,168,138,0.3)",
  boxShadow: "inset 0 2px 8px rgba(0,0,0,0.25), 0 0 12px rgba(91,168,138,0.15)",
};

const ORGANIC_ACTIVE = {
  background: "linear-gradient(145deg, rgba(91,163,184,0.3), rgba(91,163,184,0.12))",
  borderColor: "rgba(91,163,184,0.35)",
  boxShadow: "0 0 16px rgba(91,163,184,0.2), inset 0 1px 1px rgba(255,255,255,0.18)",
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
          borderColor: "rgba(255,255,255,0.14)",
          boxShadow: "0 -24px 60px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)",
          backdropFilter: "blur(20px)",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-50"
          style={{ background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(91,163,184,0.1), transparent 70%)" }}
        />
        <div className="relative z-10 mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white/75">{title}</p>
          <button
            type="button"
            onClick={(event) => {
              absorb(event);
              onClose();
            }}
            className="rounded-full border px-4 py-1.5 text-sm font-semibold transition hover:text-white"
            style={{
              background: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
              borderColor: "rgba(255,255,255,0.14)",
              color: "#7dc8d4",
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
  const minutes = Array.from({ length: 60 }, (_, index) => index);
  const updateTime = (patch) => {
    const next = { ...parsed, ...patch };
    const nextValue = buildTimeValue(next.hour12, next.minute, next.suffix);
    onChange(max && nextValue > max ? max : nextValue);
  };

  return (
    <div ref={fieldRef} className="rounded-2xl border p-3" style={GLASS_SURFACE}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between">
        <span className="text-sm text-white/60">{label}</span>
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
                    className={`mb-1 flex h-12 w-full items-center justify-center rounded-xl border text-lg font-semibold transition last:mb-0 ${
                      isActive ? "text-white" : "border-transparent text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                    style={isActive ? ORGANIC_ACTIVE : undefined}
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
                  className={`rounded-2xl border text-base font-bold transition ${isActive ? "text-white" : "border-white/10 bg-black/25 text-white/60"}`}
                  style={isActive ? ORGANIC_ACTIVE : undefined}
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
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
        <span className={`${large ? "text-5xl" : "text-base"} text-right font-bold text-white`}>
          {textValue || placeholder}{unit && <span className="ml-1 text-xs text-white/55">{unit}</span>}
        </span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} anchorRef={fieldRef} tall>
        {/* Input preview */}
        <div className="mb-3 flex min-h-[48px] items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5">
          <span className="w-full text-center text-2xl font-bold text-white">
            {textValue || <span className="text-white/40">{placeholder}</span>}
          </span>
          {unit && textValue && <span className="ml-1 text-xs text-white/55">{unit}</span>}
          {textValue && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="ml-2 shrink-0 text-xs font-semibold text-white/40 transition hover:text-white/70"
            >
              Clear
            </button>
          )}
        </div>

        {/* Number pad with iOS-style keys */}
        <div className="grid grid-cols-3 gap-[5px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                press(key);
              }}
              className="h-[52px] rounded-[9px] border text-base font-bold text-white/95 transition-all duration-100 active:scale-[0.94]"
              style={IOS_KEY}
              onPointerDown={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, IOS_KEY_PRESSED); }}
              onPointerUp={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, IOS_KEY); }}
              onPointerLeave={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, IOS_KEY); }}
            >
              {key === "back" ? <Delete className="h-5 w-5 mx-auto" /> : key === "clear" ? "Clear" : key}
            </button>
          ))}
        </div>
      </CustomInputTray>
    </div>
  );
}

const IOS_KEY = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)",
  borderColor: "rgba(255,255,255,0.08)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 1px 3px rgba(0,0,0,0.2)",
};

const IOS_KEY_DARK = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
  borderColor: "rgba(255,255,255,0.06)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

const IOS_KEY_PRESSED = {
  background: "linear-gradient(180deg, rgba(91,168,138,0.3) 0%, rgba(91,168,138,0.1) 100%)",
  borderColor: "rgba(91,168,138,0.28)",
  boxShadow: "inset 0 2px 8px rgba(0,0,0,0.2), 0 0 10px rgba(91,168,138,0.12)",
};

export function TextPadField({ label, value, onChange, placeholder, multiline = false }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef(null);
  const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const add = (key) => onChange(`${value || ""}${key}`);

  const KeyButton = ({ children, onClick, wide = false, style = IOS_KEY, className = "" }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`h-[52px] min-w-0 rounded-[9px] border text-base font-normal text-white/95 transition-all duration-100 active:scale-[0.94] ${wide ? "flex-1" : "shrink-0"} ${className}`}
      style={style}
      onPointerDown={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, IOS_KEY_PRESSED); }}
      onPointerUp={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, style); }}
      onPointerLeave={(e) => { e.currentTarget.style.cssText = ""; Object.assign(e.currentTarget.style, style); }}
    >
      {children}
    </button>
  );

  return (
    <div ref={fieldRef}>
      {label && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`w-full rounded-2xl border px-4 py-3.5 text-left text-sm text-white outline-none transition ${multiline ? "min-h-20" : ""}`}
        style={GLASS_SURFACE}
      >
        {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-white/50">{placeholder}</span>}
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label || "Text"} tall anchorRef={fieldRef}>
        {/* Text preview */}
        <div className="mb-3 flex min-h-[48px] items-center rounded-2xl border border-white/10 bg-black/30 px-4 py-2.5">
          <span className="w-full break-words text-base text-white">
            {value || <span className="text-white/40">{placeholder}</span>}
          </span>
          {value && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="ml-2 shrink-0 text-xs font-semibold text-white/40 transition hover:text-white/70"
            >
              Clear
            </button>
          )}
        </div>

        {/* iOS-style keyboard */}
        <div className="space-y-[7px]">
          {/* Row 1: q-p */}
          <div className="flex gap-[5px]">
            {[...rows[0]].map((letter) => (
              <KeyButton key={letter} onClick={() => add(letter)} wide>
                {letter}
              </KeyButton>
            ))}
          </div>
          {/* Row 2: a-l (offset like iOS) */}
          <div className="flex gap-[5px] px-[18px]">
            {[...rows[1]].map((letter) => (
              <KeyButton key={letter} onClick={() => add(letter)} wide>
                {letter}
              </KeyButton>
            ))}
          </div>
          {/* Row 3: comma + z-m + delete */}
          <div className="flex gap-[5px]">
            <KeyButton onClick={() => add(",")} style={IOS_KEY_DARK} className="w-[34px] text-sm text-white/60">,</KeyButton>
            {[...rows[2]].map((letter) => (
              <KeyButton key={letter} onClick={() => add(letter)} wide>
                {letter}
              </KeyButton>
            ))}
            <KeyButton onClick={() => onChange(String(value || "").slice(0, -1))} style={IOS_KEY_DARK} className="w-[44px] flex items-center justify-center text-white/60">
              <Delete className="h-5 w-5" />
            </KeyButton>
          </div>
          {/* Row 4: period + space + return */}
          <div className="flex gap-[5px]">
            <KeyButton onClick={() => add(".")} style={IOS_KEY_DARK} className="w-[34px] text-sm text-white/60">.</KeyButton>
            <KeyButton onClick={() => add(" ")} style={IOS_KEY_DARK} className="flex-[5] text-sm text-white/50">space</KeyButton>
            <KeyButton onClick={() => setOpen(false)} style={IOS_KEY_DARK} className="w-[72px] flex items-center justify-center text-sm text-white/60">
              <ArrowLeft className="h-4 w-4" />
            </KeyButton>
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
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/55">{label}</span>
        <span className="min-w-0 text-right text-sm font-semibold text-white">
          {selected ? selected.label : <span className="text-white/50">{placeholder}</span>}
        </span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} tall anchorRef={fieldRef}>
        <div
          className="h-[36dvh] touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-black/25 p-1"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
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
                    ? ORGANIC_ACTIVE
                    : { borderColor: "rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)" }
                }
              >
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-semibold ${isSelected ? "text-white" : "text-white/70"}`}>{option.label}</span>
                  {option.description && <span className="text-[10px] uppercase tracking-wider text-white/45">{option.description}</span>}
                </span>
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: isSelected ? "#5ba3b8" : "rgba(255,255,255,0.15)" }} />
              </button>
            );
          })}
        </div>
      </CustomInputTray>
    </div>
  );
}