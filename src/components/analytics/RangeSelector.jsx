import { motion } from "framer-motion";

const RANGES = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 60, label: "60d" },
  { value: 90, label: "90d" },
  { value: 270, label: "9mo" },
];

export default function RangeSelector({ value, onChange }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-full p-1"
      style={{
        background: "rgba(255,255,255,0.035)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`relative px-3 py-1 text-[11px] font-semibold rounded-full transition-colors ${
            value === range.value ? "text-white" : "text-white/35 hover:text-white/60"
          }`}
        >
          {value === range.value && (
            <motion.div
              layoutId="analytics-range-active"
              className="absolute inset-0 rounded-full"
              style={{
                background: "rgba(91,168,138,0.16)",
                boxShadow: "inset 0 1px 2px rgba(91,168,138,0.10), 0 1px 3px rgba(91,168,138,0.06)",
              }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative z-10">{range.label}</span>
        </button>
      ))}
    </div>
  );
}