import { motion } from "framer-motion";
import { Wind } from "lucide-react";

function getComfortStatus(percentage) {
  if (percentage === null) return { label: "Waiting for today", color: "#746959" };
  if (percentage >= 70) return { label: "Flowing beautifully", color: "#4d5742" };
  if (percentage >= 50) return { label: "Finding your rhythm", color: "#8a5a12" };
  return { label: "Every moment counts", color: "#9c3f2e" };
}

export default function ComfortZoneCard({ percentage }) {
  const status = getComfortStatus(percentage);
  const displayValue = percentage === null ? "--" : `${Math.round(percentage)}%`;

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4"
      style={{ background: "transparent", border: "none", boxShadow: "none" }}>

      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Daily Balance</span>
        
      </div>

      <div className="relative z-10 mt-1">
        <span className="text-4xl font-black leading-none" style={{ color: "#3f3830" }}>{displayValue}</span>
        <p className="mt-1.5 text-[11px]" style={{ color: "#746959" }}>Time in Comfort Zone</p>
      </div>


    </motion.div>);

}