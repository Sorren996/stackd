import { useId, useMemo } from "react";
import { generateActivityCurve, formatMinutes } from "@/lib/insulinPharmacology";

/**
 * Compact insulin dose row showing the PK activity curve, current position
 * marker, status label, and remaining duration. All values come from the
 * existing pharmacokinetic calculation system passed via the `dose` prop.
 */
export default function InsulinDoseRow({ dose }) {
  const { shortName, units, iob, color, statusLabel, timingInfo, type, time } = dose;
  const progress = timingInfo?.progress ?? 0;
  const remainingMin = timingInfo?.remainingMin ?? 0;
  const isSettling = remainingMin <= 1;
  const rawId = useId();
  const clipId = `iob-clip-${rawId.replace(/:/g, "")}`;

  const curve = useMemo(() => {
    if (!type || !units || !Number.isFinite(time)) return [];
    try {
      return generateActivityCurve({ insulin_type: type, units, administered_at: time });
    } catch {
      return [];
    }
  }, [type, units, time]);

  const pathData = useMemo(() => {
    if (curve.length < 2) return null;
    const W = 100;
    const H = 100;
    const maxActivity = Math.max(...curve.map((p) => p.activity), 0.001);
    const pts = curve.map((p, i) => ({
      x: (i / (curve.length - 1)) * W,
      y: H - (p.activity / maxActivity) * H * 0.82 - 8,
    }));
    const line = pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
    const area = `${line} L ${W} ${H} L 0 ${H} Z`;
    return { line, area };
  }, [curve]);

  const markerPct = Math.min(100, Math.max(0, progress * 100));
  const markerY = useMemo(() => {
    if (curve.length < 2) return 50;
    const maxActivity = Math.max(...curve.map((p) => p.activity), 0.001);
    const idx = progress * (curve.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, curve.length - 1);
    const frac = idx - lo;
    const activity = curve[lo].activity + (curve[hi].activity - curve[lo].activity) * frac;
    return 100 - (activity / maxActivity) * 100 * 0.82 - 8;
  }, [curve, progress]);
  const formattedUnits = units % 1 === 0 ? String(units) : units.toFixed(1);
  // Display-only: IOB is always shown as a whole number for visual consistency
  // with the card totals. The underlying `iob` value retains full precision.
  const formattedIob = String(Math.round(iob));

  return (
    <div className="rounded-lg bg-white/[0.025] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate text-xs font-semibold text-white/85">{shortName}</span>
          <span className="shrink-0 text-[10px] text-white/40">· {formattedUnits}u dose</span>
        </div>
        <span className="shrink-0 text-sm font-bold text-white">
          {formattedIob}u <span className="text-[10px] font-medium text-white/40">active</span>
        </span>
      </div>

      <div className="relative mt-2 h-6">
        {pathData ? (
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={markerPct} height="100" />
              </clipPath>
            </defs>
            <path d={pathData.area} fill={color} opacity="0.1" />
            <path d={pathData.line} fill="none" stroke={color} strokeWidth="1.5" opacity="0.25" vectorEffect="non-scaling-stroke" />
            <g clipPath={`url(#${clipId})`}>
              <path d={pathData.area} fill={color} opacity="0.26" />
              <path d={pathData.line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
        ) : (
          <div className="relative h-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${markerPct}%`, background: `linear-gradient(90deg, ${color}20, ${color}40)` }} />
            <div className="absolute inset-y-0" style={{ left: `${markerPct}%`, right: 0, background: `linear-gradient(90deg, ${color}80, ${color}30)` }} />
          </div>
        )}
        <div className="pointer-events-none absolute bottom-0 top-0" style={{ left: `${markerPct}%` }}>
          <div className="h-full w-px bg-white/40" />
          <div className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ top: `${markerY}%`, boxShadow: `0 0 5px ${color}` }} />
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-white/50">{statusLabel}</span>
        <span className="text-[10px] font-medium" style={{ color: isSettling ? "rgba(255,255,255,0.35)" : color }}>
          {isSettling ? "Gently settling" : `~${formatMinutes(remainingMin)} remaining`}
        </span>
      </div>
    </div>
  );
}