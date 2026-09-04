import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

export default function DaySection({ icon: Icon, iconColor, label, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <button
        type="button"
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        className={`flex w-full items-center gap-2 px-4 py-3 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        disabled={!collapsible}
      >
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: iconColor || "rgba(255,255,255,0.5)" }} />}
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/50">{label}</span>
        {collapsible && (
          <ChevronDown className={`ml-auto h-4 w-4 text-white/40 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}