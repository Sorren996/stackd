// The projection estimate strip.
//
// Shows only a selected model forecast point. At rest and on past readings
// the contents are empty, while the reserved slot keeps the plot still.
//
// THE SLOT IS FIXED. The strip occupies exactly STRIP_SLOT_PX whether or not
// there is a projection, so the plot, its scale and its axis never move as a
// forecast appears or ends. A strip with nothing to say is invisible, never
// absent.
//
// Copy is not invented here: the eyebrow and the value with its unit come from
// the same helper the reading card uses, so the two can never drift. The value
// goes through that helper's unit formatting, so mmol/L converts and carries its
// own label, and the range collapses to "likely around X" when its ends round to
// the same number.

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { projectionCardCopy } from "@/components/graph/ProjectionTooltipCard";

// 8px lead-in + 12px eyebrow + 4px gap + 22px value. Only the strip's own
// contents ever animate; this height is a constant.
export const STRIP_SLOT_PX = 46;

const REVEAL = { duration: 0.18, ease: [0.32, 0.72, 0.25, 1] };

export default function ProjectionEstimateStrip({ selectionSource }) {
  const [shown, setShown] = useState(false);
  const textRefs = useRef({});
  const point = selectionSource.getSnapshot();
  const copy = projectionCardCopy(point?.kind === "forecast" ? point : null);
  useLayoutEffect(() => {
    const update = (entry) => {
      const next = projectionCardCopy(entry?.kind === "forecast" ? entry : null);
      if (Boolean(next) !== shown) setShown(Boolean(next));
      if (next) for (const field of ['eyebrow', 'value', 'unit', 'range']) {
        const element = textRefs.current[field];
        if (element && element.textContent !== (next[field] || '')) element.textContent = next[field] || '';
      }
    };
    update(selectionSource.getSnapshot());
    return selectionSource.subscribe(update);
  }, [selectionSource, shown]);

  return (
    <div
      className="relative w-full"
      style={{ height: STRIP_SLOT_PX }}
      data-projection-estimate={shown ? "shown" : "empty"}
    >
      <AnimatePresence initial={false}>
        {shown && copy && (
          <motion.div
            key="estimate"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={REVEAL}
            className="absolute inset-x-0 top-0 px-[18px] pt-2"
          >
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: "#AF751B" }}
              />
              <span
                ref={el => { textRefs.current.eyebrow = el; }}
                className="text-[10px] font-semibold uppercase"
                style={{ letterSpacing: ".16em", color: "#8F7E6B", lineHeight: "12px" }}
              >
                {copy.eyebrow}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                ref={el => { textRefs.current.value = el; }}
                style={{
                  fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                  fontSize: 22,
                  lineHeight: 1,
                  // The projection's own text token: amber, 5.3:1 on the cream
                  // card it sits in.
                  color: "#8a5a12",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.01em",
                }}
              >
                {copy.value}
              </span>
              <span ref={el => { textRefs.current.unit = el; }} className="text-[11px] font-medium" style={{ color: "#8F7E6B" }}>
                {copy.unit}
              </span>
              <span ref={el => { textRefs.current.range = el; }} className="text-[11px] leading-none" style={{ color: "#5B5046" }}>
                {copy.range}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}