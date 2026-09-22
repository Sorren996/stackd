// Core information layers — shows the 5 categories of information Stackd
// brings together into one review. Each layer has a label, description, and
// a mini visual reproduction of the relevant app UI. Layers animate in
// sequence on scroll to communicate "coming together."
import { motion } from "framer-motion";
import { ArrowRight, Activity, Droplet, Wheat, Utensils, SlidersHorizontal } from "lucide-react";

const LAYERS = [
  {
    icon: Droplet,
    label: "Glucose",
    desc: "Current reading and trend",
    visual: () => (
      <div className="flex items-end gap-1.5">
        <span className="text-2xl font-black leading-none text-white">142</span>
        <span className="mb-0.5 text-[10px] font-medium text-white/40">mg/dL</span>
        <ArrowRight className="mb-1 h-4 w-4 text-white/60" />
      </div>
    ),
  },
  {
    icon: Activity,
    label: "Insulin",
    desc: "Active insulin and recent activity",
    visual: () => (
      <div className="flex items-end gap-1.5">
        <span className="text-2xl font-black leading-none text-white">3</span>
        <span className="mb-0.5 text-[10px] font-medium text-white/40">u on board</span>
      </div>
    ),
  },
  {
    icon: Wheat,
    label: "Carbs",
    desc: "Meal carbohydrates and absorption",
    visual: () => (
      <div className="flex items-end gap-1.5">
        <span className="text-2xl font-black leading-none text-white">45</span>
        <span className="mb-0.5 text-[10px] font-medium text-white/40">g</span>
      </div>
    ),
  },
  {
    icon: Utensils,
    label: "Meal",
    desc: "Context that may affect glucose after eating",
    visual: () => (
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#5f8cf5" }} />
        <span className="text-sm font-semibold text-white/70">Reviewing</span>
      </div>
    ),
  },
  {
    icon: SlidersHorizontal,
    label: "Settings",
    desc: "Your configured insulin settings and review preferences",
    visual: () => (
      <div className="flex items-end gap-1.5">
        <span className="text-sm font-bold text-white">1:10</span>
        <span className="mb-0.5 text-[10px] font-medium text-white/40">IC ratio</span>
      </div>
    ),
  },
];

export default function InfoLayers() {
  return (
    <div className="mt-12 space-y-3">
      {LAYERS.map((layer, i) => {
        const Icon = layer.icon;
        return (
          <motion.div
            key={layer.label}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.4, delay: i * 0.06 }}
            className="flex items-center gap-4 rounded-2xl p-4"
            style={{
              background: "#fdf9f2",
              border: "1px solid #eadccf",
            }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: "rgba(91, 101, 80, 0.10)",
                border: "1px solid rgba(91, 101, 80, 0.20)",
              }}
            >
              <Icon className="h-5 w-5" style={{ color: "#5b6550" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{layer.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-white/45">{layer.desc}</p>
            </div>
            <div className="shrink-0">{layer.visual()}</div>
          </motion.div>
        );
      })}
    </div>
  );
}