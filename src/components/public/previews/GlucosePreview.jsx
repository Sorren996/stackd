import { motion } from "framer-motion";
import { Home, BarChart3, BookOpen, User, Plus } from "lucide-react";
import TrendArrow from "@/components/glucose/TrendArrow";
import PhoneFrame from "@/components/public/PhoneFrame";
import { Flag, GlucoseCurve, PreviewCard, SampleTag } from "@/components/public/parts";

const NAV = [
  { icon: Home, label: "Home" },
  { icon: BarChart3, label: "Insights" },
  null,
  { icon: BookOpen, label: "Journal" },
  { icon: User, label: "Profile" },
];

/**
 * The dashboard, as it actually looks: the current reading with its trend
 * arrow, the target band behind the curve, a dashed projection kept visibly
 * separate from the measured line, and the app's own bottom navigation.
 */
export default function GlucosePreview() {
  return (
    <div className="relative">
      <div className="mb-3 flex justify-center">
        <SampleTag />
      </div>
      <PhoneFrame>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
            Today
          </span>
          <span className="text-[11px]" style={{ color: "#746959" }}>
            Reading 2 minutes ago
          </span>
        </div>

        <PreviewCard>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-end gap-2">
              <span className="text-[44px] font-black leading-none tracking-tight tabular-nums" style={{ color: "#3f3830" }}>
                118
              </span>
              <span className="pb-1 text-[11px] font-medium" style={{ color: "#746959" }}>
                mg/dL
              </span>
              <span className="pb-1" style={{ color: "#4d5742" }}>
                <TrendArrow icon="right" size={20} label="Holding steady" />
              </span>
            </div>
            <Flag tone="on">In comfort zone</Flag>
          </div>

          <div className="mt-4">
            <GlucoseCurve />
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#6b6153" }}>
              <span className="inline-block h-[2px] w-4 rounded-full" style={{ background: "#3f3830" }} />
              Measured
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#8a5a12" }}>
              <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "#af751b" }} />
              Projected
            </span>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#4d5742" }}>
              <span className="inline-block h-2 w-4 rounded-sm" style={{ background: "rgba(91, 101, 80, 0.24)" }} />
              Your target range
            </span>
          </div>
        </PreviewCard>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <PreviewCard label="Daily balance">
            <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: "#3f3830" }}>
              72%
            </span>
            <p className="mt-1 text-[10px]" style={{ color: "#746959" }}>
              Time in range today
            </p>
          </PreviewCard>
          <PreviewCard label="Active insulin">
            <span className="text-[22px] font-black leading-none tabular-nums" style={{ color: "#3f3830" }}>
              2.6 u
            </span>
            <p className="mt-1 text-[10px]" style={{ color: "#746959" }}>
              Estimated from your logs
            </p>
          </PreviewCard>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mt-3 flex items-center justify-between rounded-full px-2 py-2"
          style={{ background: "#fdf9f2", border: "1px solid #eadccf" }}
          aria-hidden="true"
        >
          {NAV.map((item, i) =>
            item ? (
              <span key={item.label} className="flex w-[52px] flex-col items-center gap-0.5" style={{ color: i === 0 ? "#9c5228" : "#746959" }}>
                <item.icon className="h-[18px] w-[18px]" strokeWidth={i === 0 ? 2.3 : 1.7} />
                <span className="text-[8px] font-semibold uppercase tracking-[0.02em]">{item.label}</span>
              </span>
            ) : (
              <span
                key="log"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: "#9c5228" }}
              >
                <Plus className="h-4 w-4" style={{ color: "#fdf9f2" }} strokeWidth={2.6} />
              </span>
            ),
          )}
        </motion.div>
      </PhoneFrame>
    </div>
  );
}