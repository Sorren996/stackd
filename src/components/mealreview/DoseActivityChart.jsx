import { useMemo } from "react";
import { generateActivityCurve, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { monotoneXPath } from "@/lib/monotonePath";
import { MR } from "./mealReviewTheme";

// The modeled dose curves that used to sit under the glucose line, kept in one
// place where they cannot be read as a glucose projection: inside the dose
// disclosure, on their own activity axis with their own time ticks.

const W = 262;
const H = 84;
const TOP = 14;
const BASE = H - 14;

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtUnits(units) {
  const n = Number(units);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function DoseActivityChart({ doses = [], from, to, now }) {
  const { curves, startClock } = useMemo(() => {
    const end = Math.min(Number.isFinite(now) ? now : Date.now(), Number.isFinite(to) ? to : Date.now());
    const list = (Array.isArray(doses) ? doses : []).filter(
      (dose) => dose && !isBasalInsulinType(dose.insulin_type) && Number(dose.units) > 0
    );
    if (!list.length || !Number.isFinite(from) || !(end > from)) return { curves: [], startClock: null };

    const maxUnits = Math.max(...list.map((dose) => Number(dose.units) || 0), 1);
    const drawn = list
      .map((dose, index) => {
        const curve = generateActivityCurve(
          { insulin_type: dose.insulin_type, units: Number(dose.units), administered_at: dose.administered_at },
          5
        ).filter((p) => p.time >= from && p.time <= end);
        if (curve.length < 2) return null;

        const scale = (Number(dose.units) || 0) / maxUnits;
        const points = curve.map((p) => ({
          x: 4 + ((p.time - from) / (end - from)) * (W - 8),
          y: BASE - Math.max(0, Math.min(1, p.activity || 0)) * scale * (BASE - TOP),
        }));
        const apex = points.reduce((best, p) => (p.y < best.y ? p : best), points[0]);
        return {
          key: dose.id || `dose-${index}`,
          line: monotoneXPath(points),
          area: `${monotoneXPath(points)} L ${points[points.length - 1].x.toFixed(1)} ${BASE} L ${points[0].x.toFixed(1)} ${BASE} Z`,
          label: `${fmtUnits(dose.units)}u`,
          labelX: Math.min(Math.max(apex.x, 16), W - 16),
          labelY: Math.max(TOP - 2, apex.y - 4),
        };
      })
      .filter(Boolean);

    return { curves: drawn, startClock: formatClock(from) };
  }, [doses, from, to, now]);

  if (!curves.length) return null;

  return (
    <div>
      <div style={{ fontSize: 10.5, color: MR.sec }}>Modeled dose activity, on its own scale</div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-1 block"
        role="presentation"
      >
        <line x1={2} y1={BASE} x2={W - 2} y2={BASE} stroke={MR.hairline} strokeWidth={0.75} />
        {curves.map((curve) => (
          <g key={curve.key}>
            <path d={curve.area} fill={MR.insulin} fillOpacity={0.1} stroke="none" />
            <path d={curve.line} fill="none" stroke={MR.insulin} strokeOpacity={0.55} strokeWidth={1.4} />
          </g>
        ))}
      </svg>
      <div className="relative" style={{ height: 14 }}>
        {curves.map((curve) => (
          <span
            key={`label-${curve.key}`}
            className="absolute whitespace-nowrap tabular-nums"
            style={{
              left: `${(curve.labelX / W) * 100}%`,
              top: 0,
              transform: "translateX(-50%)",
              fontSize: 9,
              fontWeight: 600,
              color: MR.rustDeep,
            }}
          >
            {curve.label}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: 9.5, color: MR.sec }}>
        <span className="tabular-nums">{startClock}</span>
        <span>now</span>
      </div>
    </div>
  );
}