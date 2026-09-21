// Guided review section — shows 5 actual Stackd screens in sequence to
// communicate the progression through a pre-dose review workflow. Uses the
// REAL CurrentGlucoseCard and InsulinDoseRow components with representative
// data; creates faithful static reproductions for MealBalanceCard and
// SplitPlanCard (which have navigation dependencies that don't belong on a
// marketing page).
import { motion } from "framer-motion";
import { Check, Clock, ChevronRight, Split, Info } from "lucide-react";
import CurrentGlucoseCard from "@/components/graph/CurrentGlucoseCard";
import InsulinDoseRow from "@/components/insulin/InsulinDoseRow";

const DOSE_TIME = Date.now() - 45 * 60 * 1000;

const SCREENS = [
  {
    num: "01",
    label: "Glucose & Trend",
    render: () => (
      <div className="space-y-3">
        <CurrentGlucoseCard
          latestGlucose={{
            recorded_at: new Date().toISOString(),
            value: 142,
            source: "dexcom_share",
            trend: "flat",
          }}
          glucoseValue={142}
          glucoseColor="#5ba88a"
          trend={{ icon: "right" }}
          rangeCardLabel="In comfort zone"
          isStale={false}
        />
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] font-semibold text-white/55">Flat</span>
          <span className="text-[11px] text-white/30">· steady, in range</span>
        </div>
      </div>
    ),
  },
  {
    num: "02",
    label: "Insulin on Board",
    render: () => (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-semibold text-white/45">Insulin on Board</span>
          <span className="text-[10px] font-medium text-white/30">Estimated activity</span>
        </div>
        <div className="flex items-end gap-6 px-1">
          <div className="flex flex-col">
            <div className="flex items-end gap-1">
              <span className="text-3xl font-black leading-none text-white">3</span>
              <span className="mb-0.5 text-[10px] font-medium text-white/40">u</span>
            </div>
            <span className="mt-1 text-[11px] font-medium text-white/45">On board</span>
          </div>
          <div className="flex flex-col">
            <span className="text-3xl font-black leading-none text-white">1</span>
            <span className="mt-1 text-[11px] font-medium text-white/45">Active dose</span>
          </div>
        </div>
        <InsulinDoseRow
          dose={{
            id: "review-novolog",
            type: "NovoLog",
            shortName: "NovoLog",
            units: 4,
            iob: 3,
            color: "#38bdf8",
            statusLabel: "Near peak",
            timingInfo: { progress: 0.25, remainingMin: 210 },
            time: DOSE_TIME,
          }}
        />
      </div>
    ),
  },
  {
    num: "03",
    label: "Meal Review",
    render: () => (
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Meal Balance</span>
          <Info className="h-3.5 w-3.5 text-white/25" />
        </div>
        <p className="text-[15px] font-bold leading-tight text-white">Reviewing your meal</p>
        <p className="text-[11px] text-white/40">45g nourishment</p>
        <div className="flex items-center gap-1.5 pt-1">
          <Clock className="h-3 w-3 shrink-0 text-white/55" />
          <span className="text-[11px] font-semibold text-white/55">1h 23m remaining in window</span>
        </div>
      </div>
    ),
  },
  {
    num: "04",
    label: "Split Dose",
    render: () => (
      <div className="flex items-center gap-3 px-1">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "#5ba88a1a", border: "1px solid #5ba88a40" }}
        >
          <Split className="h-4 w-4" style={{ color: "#5ba88a" }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">Pizza</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <Clock className="h-3 w-3" style={{ color: "#5ba88a" }} />
            <span className="text-xs" style={{ color: "#5ba88a" }}>Review in 45m</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
      </div>
    ),
  },
  {
    num: "05",
    label: "Review Complete",
    render: () => (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "#5ba88a15", border: "1px solid #5ba88a30" }}
        >
          <Check className="h-6 w-6" style={{ color: "#5ba88a" }} strokeWidth={2.5} />
        </div>
        <p className="mt-3 text-sm font-semibold text-white">Everything checked</p>
        <p className="mt-0.5 text-[11px] text-white/40">Ready when you are</p>
      </div>
    ),
  },
];

const CARD_STYLE = {
  background: "linear-gradient(165deg, rgba(18,28,23,0.60), rgba(10,16,13,0.50))",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 16px 48px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.06)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
};

export default function ReviewShowcase() {
  return (
    <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SCREENS.map((screen, i) => (
        <motion.div
          key={screen.num}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
          className="rounded-2xl p-4"
          style={CARD_STYLE}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[10px] font-bold tabular-nums text-white/30">{screen.num}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{screen.label}</span>
          </div>
          {screen.render()}
        </motion.div>
      ))}
    </div>
  );
}