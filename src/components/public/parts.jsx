// Shared pieces of every public product preview.
//
// Everything a preview shows is drawn from fixed, illustrative values: no real
// account is ever read, nothing counts up on its own, and any number that could
// be mistaken for a measurement carries the same "Illustrative example" tag.
import { cn } from "@/lib/utils";

/** Marks a preview as an example, never a real person's record. */
export function SampleTag({ className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
        className,
      )}
      style={{ background: "rgba(76, 103, 112, 0.10)", color: "#3f5760" }}
    >
      Illustrative example
    </span>
  );
}

/** A cream reading surface, the same card the app itself uses. */
export function PreviewCard({ label, right, children, className }) {
  return (
    <div
      className={cn("rounded-3xl p-4 sm:p-5", className)}
      style={{
        background: "#fdf9f2",
        border: "1px solid #eadccf",
        boxShadow: "0 1px 2px rgba(63, 56, 48, 0.04), 0 10px 30px rgba(35, 49, 54, 0.14)",
      }}
    >
      {(label || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {label && (
            <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#6b6153" }}>
              {label}
            </span>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Label and value on one line, divided by the app's warm hairline. */
export function StatRow({ label, value, note }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 py-2.5"
      style={{ borderTop: "1px solid #f0e6d9" }}
    >
      <span className="text-xs" style={{ color: "#6b6153" }}>
        {label}
      </span>
      <span className="text-right text-sm font-semibold tabular-nums" style={{ color: "#3f3830" }}>
        {value}
        {note ? <span className="ml-1 text-[10px] font-medium" style={{ color: "#746959" }}>{note}</span> : null}
      </span>
    </div>
  );
}

/** A small state chip: "On", "Off", "Estimated", "Measured". */
export function Flag({ children, tone = "quiet" }) {
  const tones = {
    quiet: { background: "rgba(107, 97, 83, 0.10)", color: "#6b6153" },
    on: { background: "rgba(91, 101, 80, 0.14)", color: "#4d5742" },
    off: { background: "rgba(107, 97, 83, 0.08)", color: "#746959" },
    brand: { background: "rgba(156, 82, 40, 0.12)", color: "#8a4a24" },
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold"
      style={tones[tone]}
    >
      {children}
    </span>
  );
}

const MIN = 40;
const MAX = 260;

/**
 * The glucose curve, drawn the way the app draws it: a soft target band, a
 * solid measured line and a dashed projected line, so a measurement is never
 * confused with a projection. Decorative, so it is hidden from assistive tech
 * and always accompanied by the same numbers in text beside it.
 */
export function GlucoseCurve({
  values = [128, 132, 141, 148, 152, 149, 143, 138, 134, 131, 129, 133],
  projection = [133, 139, 146, 150],
  height = 118,
  low = 80,
  high = 180,
}) {
  const width = 300;
  const step = width / (values.length + projection.length - 1);
  const y = (v) => height - ((v - MIN) / (MAX - MIN)) * height;
  const path = (list, offset) =>
    list.map((v, i) => `${i === 0 ? "M" : "L"} ${((i + offset) * step).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect x="0" y={y(high)} width={width} height={y(low) - y(high)} fill="rgba(91, 101, 80, 0.10)" />
      <path d={path(values, 0)} fill="none" stroke="#3f3830" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d={path(projection, values.length - 1)}
        fill="none"
        stroke="#af751b"
        strokeWidth="2.2"
        strokeDasharray="5 5"
        strokeLinecap="round"
      />
      <circle cx={(values.length - 1) * step} cy={y(values[values.length - 1])} r="3.6" fill="#3f3830" />
    </svg>
  );
}