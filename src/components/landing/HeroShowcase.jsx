// Faithful reproduction of the Stackd dashboard's top section, rendered with
// representative data. Uses the REAL ComfortZoneCard, CurrentGlucoseCard, and
// InsulinDoseRow components — the exact same visual components the app uses.
import ComfortZoneCard from "@/components/ComfortZoneCard";
import CurrentGlucoseCard from "@/components/graph/CurrentGlucoseCard";
import InsulinDoseRow from "@/components/insulin/InsulinDoseRow";
import ShowcaseGraph from "./ShowcaseGraph";

const DOSE_TIME = Date.now() - 45 * 60 * 1000;

const SHOWCASE_GLUCOSE = {
  latestGlucose: {
    recorded_at: new Date().toISOString(),
    value: 142,
    source: "dexcom_share",
    trend: "flat",
  },
  glucoseValue: 142,
  glucoseColor: "#5b6550",
  trend: { icon: "right" },
  rangeCardLabel: "In comfort zone",
  isStale: false,
};

const SHOWCASE_DOSE = {
  id: "showcase-novolog",
  type: "NovoLog",
  shortName: "NovoLog",
  units: 4,
  iob: 3,
  color: "#38bdf8",
  statusLabel: "Near peak",
  timingInfo: { progress: 0.25, remainingMin: 210 },
  time: DOSE_TIME,
};

export default function HeroShowcase() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-3xl p-4"
      style={{
        background: "#fdf9f2",
        border: "1px solid #eadccf",
        boxShadow: "0 4px 20px rgba(63, 56, 48, 0.08)",
      }}
    >
      {/* Top cards — 2-col grid matching the real dashboard */}
      <div className="grid grid-cols-2 gap-3">
        <ComfortZoneCard percentage={68} />
        <CurrentGlucoseCard {...SHOWCASE_GLUCOSE} />
      </div>

      {/* Glucose graph */}
      <div className="mt-3">
        <ShowcaseGraph height={150} />
      </div>

      {/* IOB section */}
      <div className="mt-4 pt-3" style={{ borderTop: "1px solid #eadccf" }}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white/45">Insulin on Board</span>
          <span className="text-[10px] font-medium text-white/30">Estimated activity</span>
        </div>
        <div className="mt-3 flex items-end gap-6">
          <div className="flex flex-col">
            <div className="flex items-end gap-1">
              <span className="text-3xl font-black leading-none text-white">3</span>
              <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
            </div>
            <span className="mt-1 text-[11px] font-medium text-white/45">Rapid-acting on board</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black leading-none text-white">1</span>
            <span className="mt-1 text-[11px] font-medium text-white/45">Active dose</span>
          </div>
        </div>
        <div className="mt-2">
          <InsulinDoseRow dose={SHOWCASE_DOSE} />
        </div>
      </div>
    </div>
  );
}