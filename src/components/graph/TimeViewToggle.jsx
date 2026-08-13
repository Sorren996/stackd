import { motion } from "framer-motion";

const VIEWS = [
  { value: 3, label: "3h" },
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
];

export default function TimeViewToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-0.5">
      {VIEWS.map((view) => (
        <button
          key={view.value}
          onClick={() => onChange(view.value)}
          className={`relative px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
            value === view.value ? "text-white" : "text-white/40 hover:text-white/70"
          }`}
        >
          {value === view.value && (
            <motion.div
              layoutId="time-view-active"
              className="absolute inset-0 rounded-lg"
              style={{ background: "rgba(53,168,121,0.15)" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">{view.label}</span>
        </button>
      ))}
    </div>
  );
}