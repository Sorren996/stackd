import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
  Scatter,
  YAxis,
  XAxis,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { GLUCOSE_STATUS_COLORS } from "@/lib/glucoseStatus";
import { getInsulinProfile } from "@/lib/insulinPharmacology";
import { minutesOfDay, getGlucoseAt } from "@/lib/dayRecapMetrics";

const HOUR = 60;
const DAY_MIN = 24 * 60;

function Legend({ color, label, ring }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={ring ? { background: "transparent", border: `1.5px solid ${color}` } : { background: color }}
      />
      <span className="text-[10px] font-medium text-white/45">{label}</span>
    </span>
  );
}

// Interactive dot rendered by recharts Scatter. recharts injects cx, cy and
// the point payload when it clones this element per data point.
function EventDot({ cx, cy, payload, color, onSelect, r = 4.5 }) {
  if (cx == null || cy == null || !payload) return null;
  const fill = payload.dotColor || color;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      stroke="rgba(15,20,18,0.9)"
      strokeWidth={1}
      style={{ cursor: "pointer" }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ payload, cx, cy });
      }}
    />
  );
}

function EventPopover({ event, onClose }) {
  if (!event) return null;
  const { payload } = event;
  const isCarb = payload.kind === "carb";
  const time = payload.time ? format(new Date(payload.time), "h:mm a") : "";

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
      />
      <div
        className="pointer-events-none absolute z-[61] -translate-x-1/2 -translate-y-full"
        style={{ left: event.cx, top: event.cy - 10 }}
      >
        <div
          className="pointer-events-auto w-max max-w-[220px] rounded-xl border px-3 py-2.5 shadow-xl"
          style={{
            background: "linear-gradient(165deg, rgba(20,30,26,0.97), rgba(12,18,15,0.97))",
            borderColor: "rgba(255,255,255,0.16)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: payload.dotColor || (isCarb ? "#f59e0b" : "#5ba3b8") }}
            />
            <span className="text-[11px] font-bold text-white">
              {isCarb ? "Nourishment" : "Support"}
            </span>
            <span className="ml-auto text-[9px] font-medium text-white/40">{time}</span>
          </div>
          {isCarb ? (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white/90">{payload.name || "Food"}</p>
              <p className="text-[11px] text-white/55">
                {Math.round(payload.carbs)}g carbs
                {payload.profile ? ` · ${payload.profile}` : ""}
              </p>
              {payload.highPF && (
                <p className="text-[10px] font-medium text-amber-300/70">Higher protein / fat</p>
              )}
              {payload.notes && <p className="text-[10px] text-white/45">{payload.notes}</p>}
            </div>
          ) : (
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white/90">{payload.type || "Insulin"}</p>
              <p className="text-[11px] text-white/55">{Math.round(payload.units * 10) / 10} units</p>
              {payload.glucoseAt != null && (
                <p className="text-[10px] text-white/45">Glucose ~{Math.round(payload.glucoseAt)} mg/dL</p>
              )}
              {payload.notes && <p className="text-[10px] text-white/45">{payload.notes}</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function DayRecapGraph({ glucose, carbs, insulin, targetLow, targetHigh }) {
  const [selected, setSelected] = useState(null);

  const readings = useMemo(
    () =>
      (glucose || [])
        .map((g) => ({
          time: new Date(g.recorded_at).getTime(),
          value: Number(g.value),
          source: g.source,
        }))
        .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
        .sort((a, b) => a.time - b.time),
    [glucose]
  );

  if (readings.length < 2) {
    return (
      <div
        className="flex h-[180px] items-center justify-center rounded-2xl border"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <p className="text-xs text-white/40">Not enough glucose data to chart this day</p>
      </div>
    );
  }

  const data = readings.map((r) => ({ x: minutesOfDay(r.time), value: r.value }));
  const values = readings.map((r) => r.value);
  const yMin = Math.max(40, Math.min(...values) - 20);
  const yMax = Math.min(400, Math.max(...values, targetHigh) + 20);
  const rangeTotal = Math.max(1, yMax - yMin);
  const ticks = [0, 6 * HOUR, 12 * HOUR, 18 * HOUR, DAY_MIN];

  // Line gradient stops derived from the user's target range, mirroring the
  // dashboard ActivityGraph: amber above the high target, white inside the
  // comfort zone, warm red below the low target. Stops are clamped monotonic.
  const hiPct = ((yMax - targetHigh) / rangeTotal) * 100;
  const loPct = ((yMax - targetLow) / rangeTotal) * 100;
  let prev = 0;
  const lineStops = [
    { offset: 0, color: GLUCOSE_STATUS_COLORS.high, opacity: 0.9 },
    { offset: Math.max(0, hiPct - 3), color: GLUCOSE_STATUS_COLORS.high, opacity: 0.7 },
    { offset: Math.min(100, hiPct + 3), color: "#ffffff", opacity: 0.7 },
    { offset: Math.max(0, loPct - 3), color: "#ffffff", opacity: 0.7 },
    { offset: Math.min(100, loPct + 3), color: GLUCOSE_STATUS_COLORS.low, opacity: 0.7 },
    { offset: 100, color: GLUCOSE_STATUS_COLORS.low, opacity: 0.9 },
  ].map((s) => {
    const offset = Math.max(prev, Math.min(100, s.offset));
    prev = offset;
    return { ...s, offset };
  });

  const carbScatter = (carbs || [])
    .map((c) => {
      const t = new Date(c.consumed_at).getTime();
      const x = minutesOfDay(t);
      if (x == null) return null;
      const glucoseAt = getGlucoseAt(readings, t);
      if (glucoseAt == null) return null;
      return {
        x,
        y: glucoseAt,
        kind: "carb",
        name: c.food_name || c.name || "Food",
        carbs: Number(c.carbs) || 0,
        profile: c.absorption_profile || c.profile,
        highPF: c.is_high_protein_fat_meal,
        notes: c.notes,
        time: c.consumed_at,
        dotColor: "#f59e0b",
      };
    })
    .filter(Boolean);

  const insulinScatter = (insulin || [])
    .map((d) => {
      const t = new Date(d.administered_at).getTime();
      const x = minutesOfDay(t);
      if (x == null) return null;
      const glucoseAt = getGlucoseAt(readings, t);
      if (glucoseAt == null) return null;
      return {
        x,
        y: glucoseAt,
        kind: "insulin",
        type: d.insulin_type,
        units: Number(d.units) || 0,
        notes: d.notes,
        time: d.administered_at,
        glucoseAt,
        dotColor: getInsulinProfile(d.insulin_type)?.color || "#5ba3b8",
      };
    })
    .filter(Boolean);

  const manualDots = readings
    .filter((r) => r.source !== "dexcom" && r.source !== "dexcom_share" && r.source !== "system")
    .map((r) => ({ x: minutesOfDay(r.time), y: r.value }));

  const handleSelect = (evt) => setSelected((cur) => (cur && cur.payload === evt.payload ? null : evt));

  return (
    <div
      className="relative rounded-2xl border p-3"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 10, right: 34, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="dayGlucoseGrad" x1="0" y1={0} x2="0" y2={1}>
              {lineStops.map((s, i) => (
                <stop key={i} offset={`${s.offset}%`} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          </defs>
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, DAY_MIN]}
            ticks={ticks}
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            tickFormatter={(v) => {
              const h = Math.floor(v / 60);
              const ampm = h >= 12 ? "p" : "a";
              const hr = h % 12 === 0 ? 12 : h % 12;
              return `${hr}${ampm}`;
            }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
          />
          <YAxis domain={[yMin, yMax]} hide />
          <ReferenceArea y1={targetLow} y2={targetHigh} fill="#5ba88a" fillOpacity={0.06} />
          <ReferenceLine
            y={targetHigh}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="3 4"
            label={{
              value: `${Math.round(targetHigh)}`,
              position: "right",
              fill: "rgba(255,255,255,0.5)",
              fontSize: 9,
              offset: 6,
            }}
          />
          <ReferenceLine
            y={targetLow}
            stroke="rgba(255,255,255,0.18)"
            strokeDasharray="3 4"
            label={{
              value: `${Math.round(targetLow)}`,
              position: "right",
              fill: "rgba(255,255,255,0.5)",
              fontSize: 9,
              offset: 6,
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="url(#dayGlucoseGrad)"
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {carbScatter.length > 0 && (
            <Scatter data={carbScatter} dataKey="y" shape={<EventDot onSelect={handleSelect} />} isAnimationActive={false} />
          )}
          {insulinScatter.length > 0 && (
            <Scatter data={insulinScatter} dataKey="y" shape={<EventDot onSelect={handleSelect} />} isAnimationActive={false} />
          )}
          {manualDots.map((d, i) => (
            <ReferenceDot
              key={`man_${i}`}
              x={d.x}
              y={d.y}
              r={3.5}
              fill={GLUCOSE_STATUS_COLORS.inRange}
              stroke="#ffffff"
              strokeWidth={1.2}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <EventPopover event={selected} onClose={() => setSelected(null)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <Legend color="#f59e0b" label="Nourishment" />
        <Legend color="#5ba3b8" label="Support" />
        <Legend color={GLUCOSE_STATUS_COLORS.inRange} label="Manual reading" ring />
      </div>
    </div>
  );
}