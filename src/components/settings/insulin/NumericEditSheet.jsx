import { useState, useEffect, useRef } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * Numeric edit sheet — identical pattern for every numeric setting.
 *
 * Small uppercase title · large bold value centered · unit below · 44px
 * circular +/− steppers flanking the value. Tapping the value switches to a
 * native numeric input (inputMode numeric) for direct typing. One help line.
 * Footer: plain-text Cancel left, copper filled Save right.
 *
 * `value` is a string; `decrement`/`increment` return the next string.
 */
export default function NumericEditSheet({
  title,
  value,
  unit,
  help,
  onSave,
  onCancel,
  decrement = (v) => v,
  increment = (v) => v,
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleValueTap = () => {
    setEditing(true);
  };

  const handleCommit = (next) => {
    setDraft(next);
    setEditing(false);
  };

  const handleMinus = () => handleCommit(decrement(draft));
  const handlePlus = () => handleCommit(increment(draft));

  const anon = value === undefined || value === null ? "" : String(value);

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-6 pt-2 text-center">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
          {title}
        </h2>
      </div>

      <div className="flex flex-col items-center px-6 pt-8 pb-2">
        <div className="flex items-center gap-6">
          {/* Minus */}
          <button
            type="button"
            onClick={handleMinus}
            aria-label={`Decrease ${title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
            style={{ background: "#f7f1e8", border: "1px solid #eadccf", color: "#3f3830" }}
          >
            <Minus className="h-5 w-5" />
          </button>

          {/* Value — tap to type */}
          <button
            type="button"
            onClick={handleValueTap}
            aria-label={`Edit ${title}`}
            className="flex flex-col items-center"
          >
            {editing ? (
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => setEditing(false)}
                aria-label={`${title} value`}
                className="w-32 bg-transparent text-center text-[34px] font-bold leading-none tabular-nums focus:outline-none"
                style={{ color: "#3f3830", borderBottom: "2px solid #9c5228" }}
              />
            ) : (
              <span
                className="text-[34px] font-bold leading-none tabular-nums"
                style={{ color: anon === "" ? "#a89e8d" : "#3f3830" }}
              >
                {anon === "" ? "—" : draft}
              </span>
            )}
            {unit && (
              <span className="mt-2 text-sm" style={{ color: "#5c554b" }}>
                {unit}
              </span>
            )}
          </button>

          {/* Plus */}
          <button
            type="button"
            onClick={handlePlus}
            aria-label={`Increase ${title}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
            style={{ background: "#f7f1e8", border: "1px solid #eadccf", color: "#3f3830" }}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-6 pt-5 pb-2 text-center">
        <p className="text-sm leading-relaxed font-serif-italic" style={{ color: "#6b6153" }}>
          {help}
        </p>
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="py-3.5 text-sm font-medium transition active:opacity-60"
          style={{ color: "#9c5228" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="rounded-full px-8 py-3.5 text-sm font-semibold transition active:scale-[0.98]"
          style={{ background: "#9c5228", color: "#fdf9f2", boxShadow: "0 4px 16px rgba(156,82,40,0.28)" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}