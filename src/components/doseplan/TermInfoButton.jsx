import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import Sheet from "@/components/Sheet";
import { DOSE_TERMS } from "@/lib/dosePlanCopy";

const COPPER = "#9c5228";
const SLATE = "#4c6770";
const CREAM = "#fdf9f2";
const INK = "#3f3830";
const TAUPE = "#6b6153";
const FAINT = "#746959";

/**
 * A tappable explanation for one prescribed-insulin setting.
 *
 * The trigger is a 44×44 target beside the field label (never hover-only), and
 * it opens a small branded sheet with a heading, one or two plain sentences and
 * a clear Done button. Sheet handles the escape key, body lock and dialog
 * semantics; focus returns to this trigger when the sheet closes.
 */
export default function TermInfoButton({ termKey }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const headingId = useId();
  const term = DOSE_TERMS[termKey];

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  if (!term) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`What is ${term.label}?`}
        aria-haspopup="dialog"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
        style={{ color: COPPER, background: "transparent" }}
      >
        <Info className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>

      <Sheet open={open} onClose={close} labelledBy={headingId}>
        <div className="px-6 pt-1 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: FAINT }}>
            {term.medical}
          </p>
          <h2
            id={headingId}
            className="mt-2 text-xl font-semibold leading-snug"
            style={{ color: SLATE }}
          >
            {term.label}
          </h2>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: INK }}>
            {term.short}
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: TAUPE }}>
            {term.more}
          </p>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: FAINT }}>
            Shown in {term.unit}.
          </p>
          <button
            type="button"
            onClick={close}
            className="mt-5 w-full rounded-full py-3.5 text-sm font-semibold transition active:scale-[0.98]"
            style={{ background: SLATE, color: CREAM }}
          >
            Done
          </button>
        </div>
      </Sheet>
    </>
  );
}