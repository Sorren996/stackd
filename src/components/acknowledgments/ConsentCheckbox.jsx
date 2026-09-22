import { motion } from "framer-motion";
import { Check } from "lucide-react";

export default function ConsentCheckbox({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] disabled:opacity-50"
      style={{
        background: checked ? "rgba(91, 101, 80, 0.08)" : "#f7f1e8",
        borderColor: checked ? "rgba(91, 101, 80, 0.35)" : "#eadccf",
      }}
    >
      <motion.div
        animate={{ scale: checked ? 1 : 0.85 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border"
        style={{
          background: checked ? "#5b6550" : "#fdf9f2",
          borderColor: checked ? "#5b6550" : "#eadccf",
        }}
      >
        {checked && <Check className="h-4 w-4" strokeWidth={3} style={{ color: "#f7f1e8" }} />}
      </motion.div>
      <span className="text-sm leading-relaxed text-white/80">{label}</span>
    </button>
  );
}