import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

export default function DaySection({ icon: Icon, iconColor, label, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "#fdf9f2",
        borderColor: "#eadccf",
        boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)",
      }}
    >
      <button
        type="button"
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        className={`flex w-full items-center gap-2 px-4 py-3 ${collapsible ? "cursor-pointer" : "cursor-default"}`}
        disabled={!collapsible}
      >
        {Icon && <Icon className="h-3.5 w-3.5" style={{ color: iconColor || "#746959" }} />}
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>{label}</span>
        {collapsible && (
          <ChevronDown className={`ml-auto h-4 w-4 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} style={{ color: "#746959" }} />
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