import { Fragment } from "react";
import { resolveReferenceLabelPositions } from "@/lib/glucoseStatus";

// Fixed (non-scrolling) overlay that places the four glucose reference-line
// labels with per-side collision protection.
//   Left column  → secondary/fixed thresholds (configurable High, fixed Low 40)
//   Right column → user target range
// The horizontal lines themselves are drawn by recharts ReferenceLine; this
// overlay only positions the numeric labels so they never overlap each other.
// When two same-side labels are too close, the lower label shifts down and a
// thin leader connects it back to its true line — the line itself never moves.
export default function ReferenceLabels({ labels, toY, chartHeight, minGap = 14 }) {
  const positions = resolveReferenceLabelPositions(labels, toY, { minGap });

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20" style={{ height: chartHeight }}>
      {labels.map((l) => {
        const pos = positions[l.id];
        if (!pos) return null;
        const isLeft = l.side === "left";
        const displaced = Math.abs(pos.delta) > 3;
        const naturalY = pos.y - pos.delta;

        return (
          <Fragment key={l.id}>
            {displaced && (
              <span
                aria-hidden="true"
                className="absolute w-px"
                style={{
                  [isLeft ? "left" : "right"]: 11,
                  top: Math.min(naturalY, pos.y),
                  height: Math.abs(pos.delta),
                  background: `${l.color}40`,
                }}
              />
            )}
            <span
              className="absolute text-[9px] font-medium leading-none whitespace-nowrap"
              style={{
                [isLeft ? "left" : "right"]: 8,
                top: pos.y,
                transform: l.anchor === "above" ? "translateY(-120%)" : "translateY(20%)",
                color: l.color,
                opacity: l.secondary ? 0.6 : 0.25,
              }}
            >
              {l.text}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}