import { useState } from "react";
import { ChevronDown } from "lucide-react";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
};

/**
 * A single collapsed row in the Meal Review detail area. Shows a label on the
 * left, a right-side preview, and expands in place to reveal children. A
 * hairline divider sits between rows. Describes, never prescribes.
 */
export default function MealCollapsibleRow({ label, preview, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t" style={{ borderColor: PALETTE.hairline }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-[13px] font-semibold" style={{ color: PALETTE.ink }}>{label}</span>
        <div className="flex items-center gap-2">
          {preview}
          <ChevronDown
            size={16}
            style={{ color: PALETTE.faint, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
          />
        </div>
      </button>
      {open && (
        <div className="pb-4">
          {children}
        </div>
      )}
    </div>
  );
}