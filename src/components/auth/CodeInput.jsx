import { useRef, useState } from "react";
import { CODE_LENGTH } from "@/lib/verification/otpState";

/**
 * Six-box code entry backed by ONE real text input.
 *
 * The input is the only thing that receives touches: it covers the boxes
 * completely (absolute, inset 0, above the slots) and the wrapper is
 * deliberately NOT pointer-events:none, so a tap anywhere on the boxes focuses
 * it and the iPhone keyboard opens.
 *
 * It is a text input, never type="number", so a leading zero survives; digits
 * are the only thing the caller stores. Because it is one input rather than six,
 * deletion, replacing a digit, paste and iOS "From Messages" autofill all
 * behave natively, with no per-digit focus race.
 *
 * The input is kept at opacity 0.01 rather than 0: a fully transparent input is
 * treated as not visible by some WebViews and will not take focus or show a
 * keyboard. 0.01 paints it, so it is hit-testable and focusable, while its own
 * text stays invisible beneath the boxes drawn on top.
 */
export default function CodeInput({
  id,
  value,
  onChange,
  onEnter,
  invalid = false,
  disabled = false,
  autoFocus = false,
  label = "Verification code",
}) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const chars = String(value || "").slice(0, CODE_LENGTH).split("");

  return (
    <div
      className="w-full"
      onClick={() => {
        if (!disabled) inputRef.current?.focus();
      }}
    >
      <div className="relative mx-auto w-fit">
        <div className="pointer-events-none flex items-center gap-2" aria-hidden="true">
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const active = focused && i === Math.min(chars.length, CODE_LENGTH - 1) && chars.length < CODE_LENGTH;
            return (
              <span
                key={i}
                className="flex h-12 w-11 items-center justify-center rounded-xl border text-xl font-semibold tabular-nums"
                style={{
                  background: "#fdf9f2",
                  color: "#3f3830",
                  // The resting boundary comes from the account-screen palette
                  // (index.css) so a code box is identifiable on cream; the
                  // fallback keeps the box drawn if this is used outside it.
                  borderColor: invalid ? "#9c3f2e" : active ? "#3f5760" : "var(--auth-control-border, #9c8e7c)",
                  boxShadow: active ? "0 0 0 3px rgba(76, 103, 112, 0.28)" : "none",
                }}
              >
                {chars[i] || ""}
              </span>
            );
          })}
        </div>

        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          enterKeyHint="done"
          maxLength={CODE_LENGTH}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Done / Enter submits only a complete code, so an unfinished field
            // is never sent for verification.
            if (e.key === "Enter" && onEnter && chars.length === CODE_LENGTH) {
              e.preventDefault();
              onEnter(String(value));
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={label}
          aria-invalid={invalid || undefined}
          className="absolute inset-0 z-10 h-full w-full cursor-text rounded-xl border-0 bg-transparent p-0 outline-none"
          style={{
            opacity: 0.01,
            color: "transparent",
            WebkitTextFillColor: "transparent",
            caretColor: "transparent",
            fontSize: 16,
          }}
        />
      </div>
    </div>
  );
}