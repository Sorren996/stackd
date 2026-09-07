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
    <div className="flex items-center gap-0.5 rounded-lg border border-white/5 bg-white/[0.03] p-0.5">
      {RANGES.map((range) => (
        <button
          key={range.value}
          onClick={() => onChange(range.value)}
          className={`relative px-2.5 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${
            value === range.value ? "text-white" : "text-white/40 hover:text-white/70"
          }`}
        >
          {value === range.value && (
            <motion.div
              layoutId="analytics-range-active"
              className="absolute inset-0 rounded-md"
              style={{ background: "rgba(53,168,121,0.15)" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">{range.label}</span>
        </button>
      ))}
    </div>
  );
}