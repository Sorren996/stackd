import { motion } from "framer-motion";

const VIEWS = [
  { value: 3, label: "3h" },
  { value: 6, label: "6h" },
  { value: 12, label: "12h" },
  { value: 24, label: "24h" },
];

export default function TimeViewToggle({ value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border p-0.5" style={{ borderColor: "#eadccf", background: "#fdf9f2" }}>
      {VIEWS.map((view) => (
        <button
          key={view.value}
          onClick={() => onChange(view.value)}
          className={`relative px-2 py-0.5 text-[11px] font-semibold rounded-md transition-colors ${
            value === view.value ? "" : "hover:opacity-70"
          }`}
          style={{ color: value === view.value ? "#3f3830" : "#746959" }}
        >
          {value === view.value && (
            <motion.div
              layoutId="time-view-active"
              className="absolute inset-0 rounded-md"
              style={{ background: "rgba(91,101,80,0.15)" }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-10">{view.label}</span>
        </button>
      ))}
    </div>
  );
}