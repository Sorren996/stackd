import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export function CustomInputTray({ open, onClose, title, children, anchorRef }) {
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
        className="fixed inset-0 z-[1000]"
        style={{ background: "rgba(63, 56, 48, 0.25)" }}
        onPointerDown={absorb}
        onPointerUp={absorb}
        onClick={(event) => {
          absorb(event);
          onClose();
        }}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[1001] min-h-[34dvh] rounded-t-3xl border px-4 pb-[max(env(safe-area-inset-bottom),0.85rem)] pt-3"
        style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 -12px 40px rgba(63, 56, 48, 0.10)" }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "#6b6153" }}>{title}</p>
          <button
            type="button"
            onClick={(event) => {
              absorb(event);
              onClose();
            }}
            className="rounded-full px-4 py-1.5 text-sm font-semibold"
            style={{ background: "#3f3830", color: "#f7f1e8" }}
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body
  );
}

/**
 * Tap-to-edit number field. Shows the current value + unit inline;
 * tapping opens a bottom-sheet number pad. Designed to read like a
 * summary value, not a raw form input.
 */
export default function NumberPadField({ label, value, onChange, placeholder = "--", decimal = true, maxLength = 6, className = "", unit }) {
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
    <div
      ref={fieldRef}
      className={`rounded-2xl px-3.5 py-2.5 ${className}`}
      style={{ background: "#f7f1e8", border: "1px solid #eadccf" }}
    >
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-12 w-full items-baseline gap-1.5 text-left">
        <span className="text-xl font-bold tabular-nums leading-none" style={{ color: textValue ? "#3f3830" : "#b8aea0" }}>{textValue || placeholder}</span>
        {unit && <span className="text-[10px] font-medium" style={{ color: "#746959" }}>{unit}</span>}
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