import { motion } from "framer-motion";

function AmbientOrb({ color, duration = 6 }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.7, 0.45] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      className="h-14 w-14 rounded-full"
      style={{
        background: `radial-gradient(circle, ${color}cc 0%, ${color}44 50%, transparent 75%)`,
        filter: "blur(8px)",
      }}
    />
  );
}

function getComfortStatus(percentage) {
  if (percentage === null) return { label: "Waiting for today", color: "rgba(255,255,255,0.5)" };
  if (percentage >= 80) return { label: "Flowing beautifully", color: "#5ba88a" };
  if (percentage >= 50) return { label: "Finding your rhythm", color: "#5ba88a" };
  if (percentage >= 25) return { label: "Gentle progress today", color: "#d4a056" };
  return { label: "Every moment counts", color: "#d4a056" };
}

export default function ComfortZoneCard({ percentage }) {
  const status = getComfortStatus(percentage);
  const displayValue = percentage === null ? "--" : `${Math.round(percentage)}%`;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="metric-card relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
        borderColor: "rgba(255,255,255,0.16)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.05)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-60"
        style={{
          background: "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 92% 118%, rgba(255,255,255,0.08), transparent 42%)",
        }}
      />
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <AmbientOrb color="rgba(255,255,255,1)" />
      </div>

      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Comfort Zone Today</span>
      </div>

      <div className="relative z-10 mt-1">
        <span className="text-2xl font-bold leading-none text-white">{displayValue}</span>
        <p className="mt-1 text-[11px] text-white/35">Time spent feeling balanced</p>
      </div>

      <span className="relative z-10 mt-2 text-xs font-semibold" style={{ color: status.color }}>
        {status.label}
      </span>
    </motion.div>
  );
}