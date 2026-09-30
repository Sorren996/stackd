// Horizontal remaining-unit bars on a shared absolute units scale.
//
// All rows use ONE scale (0 → axisMax). The filled copper accent represents
// estimated remaining units; the muted faded-copper extent behind it
// represents the logged amount on that same scale. No per-row normalization,
// no percent-remaining, no time-progress, no outlines around data bars.

const ACCENT = "#9c5228"; // copper — estimated remaining units
const MUTED_EXTENT = "rgba(156, 82, 40, 0.20)"; // faded copper — logged amount
const TRACK = "rgba(63, 56, 48, 0.05)"; // light track behind bars

/**
 * Compute a shared absolute units axis covering every logged and remaining
 * amount across all displayed doses. Rounds up to the nearest 5u, minimum 5u.
 * Ticks step by 5 so the axis stays sparse and readable on mobile widths.
 */
export function computeAxis(doses) {
  const maxVal = (doses || []).reduce(
    (m, d) => Math.max(m, Number(d.units) || 0, Number(d.iob) || 0),
    0
  );
  const axisMax = Math.max(5, Math.ceil(maxVal / 5) * 5);
  const ticks = [];
  for (let v = 0; v <= axisMax + 0.001; v += 5) ticks.push(v);
  return { axisMax, ticks };
}

/** Shared axis tick labels, distributed edge-to-edge with flex. */
export function RemainingAxis({ axisMax, ticks, color = "#746959" }) {
  return (
    <div className="flex justify-between" style={{ color }}>
      {ticks.map((t) => (
        <span key={t} className="text-[9px] font-medium tabular-nums leading-none">
          {t}
          {t === axisMax ? "u" : ""}
        </span>
      ))}
    </div>
  );
}

/** Compact legend tying bar colors to their meaning. */
export function RemainingLegend() {
  return (
    <div className="flex items-center gap-3 text-[9px] leading-none" style={{ color: "#746959" }}>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: ACCENT }} />
        Estimated remaining
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: MUTED_EXTENT }} />
        Logged amount
      </span>
    </div>
  );
}

/**
 * A single horizontal bar on the shared scale.
 * Muted extent (logged) renders first; filled accent (remaining) renders on
 * top. When remaining equals logged the filled bar covers the muted entirely;
 * when logged exceeds remaining the muted extends beyond — both lengths use
 * the same absolute scale.
 */
export default function RemainingBar({ logged, remaining, axisMax }) {
  const loggedPct = Math.min(100, (Math.max(0, Number(logged) || 0) / axisMax) * 100);
  const remainingPct = Math.min(100, (Math.max(0, Number(remaining) || 0) / axisMax) * 100);
  return (
    <div className="relative h-2 rounded-full overflow-hidden" style={{ background: TRACK }}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${loggedPct}%`, background: MUTED_EXTENT }}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${remainingPct}%`, background: ACCENT }}
      />
    </div>
  );
}