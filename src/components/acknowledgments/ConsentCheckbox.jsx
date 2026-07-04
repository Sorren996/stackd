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
        background: checked
          ? "linear-gradient(145deg, rgba(91,168,138,0.12), rgba(91,163,184,0.06))"
          : "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        borderColor: checked ? "rgba(91,168,138,0.35)" : "rgba(255,255,255,0.10)",
      }}
    >
      <motion.div
        animate={{ scale: checked ? 1 : 0.85 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border"
        style={{
          background: checked ? "rgba(91,168,138,0.85)" : "rgba(255,255,255,0.04)",
          borderColor: checked ? "rgba(91,168,138,0.9)" : "rgba(255,255,255,0.15)",
        }}
      >
        {checked && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
      </motion.div>
      <span className="text-sm leading-relaxed text-white/80">{label}</span>
    </button>
  );
}