import { useId } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { MR } from "./mealReviewTheme";

/**
 * One meal in the shared timeline: a full-width, keyboard-operable toggle that
 * reveals that meal's own details inline, inside the same card.
 *
 * The panel animates on grid-template-rows so its real height is used (nothing
 * is clipped once open); with reduced motion the height simply snaps. Several
 * rows may be open at once so two meals can be compared.
 */
export default function MealAccordionRow({ name, time, carbs, open, onToggle, children, first = false }) {
  const panelId = useId();
  const buttonId = `${panelId}-toggle`;
  const reduceMotion = useReducedMotion();

  return (
    <div className={first ? "" : "border-t"} style={first ? undefined : { borderColor: MR.hairline }}>
      <button
        id={buttonId}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-[52px] w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span
            className="block"
            style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: MR.ink, overflowWrap: "anywhere" }}
          >
            {name}
          </span>
          <span className="mt-0.5 block tabular-nums" style={{ fontSize: 11.5, color: MR.sec }}>
            {time ? `${time} · ` : ""}
            {carbs} g carbs
          </span>
        </span>
        <ChevronDown
          size={17}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: open ? MR.rust : MR.sec,
            transform: open ? "rotate(180deg)" : "none",
            transition: reduceMotion ? "none" : "transform 240ms cubic-bezier(.32,.72,.25,1)",
          }}
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        aria-hidden={!open}
        inert={!open ? "" : undefined}
        hidden={!open && reduceMotion ? true : undefined}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: reduceMotion ? "none" : "grid-template-rows 280ms cubic-bezier(.32,.72,.25,1)",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}