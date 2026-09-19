import { motion } from "framer-motion";
import { Activity, Bluetooth, Pencil, SlidersHorizontal, Layers } from "lucide-react";

const FEATURES = [
  {
    icon: Activity,
    title: "Glucose review",
    body: 'Recent readings and trend direction in plain view, so "what\'s my number?" never means "where\'s my phone and three apps?"',
  },
  {
    icon: Bluetooth,
    title: "Dexcom connection, optional",
    body: "If you use a Dexcom, link it once and your readings stay current automatically. No manual entry, no transcribing numbers.",
  },
  {
    icon: Pencil,
    title: "Manual logging, fully supported",
    body: "No CGM? No problem. Stackd treats manually logged readings as a first-class part of the flow, not a workaround. A Dexcom is not required.",
  },
  {
    icon: SlidersHorizontal,
    title: "Insulin settings",
    body: "Your correction factors, carb ratios, and the rest of your regimen, laid out clearly where the dose decision actually happens.",
  },
  {
    icon: Layers,
    title: "Split dose plans",
    body: "Doses split across timing, type, or both. Stackd tracks the full picture so a split dose is a plan, not a mental juggling act.",
  },
];

export default function LandingFeatures() {
  return (
    <section id="features" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-5xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
        >
          Built for the moments before the dose.
        </motion.h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                className="stackd-card rounded-2xl p-5"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{
                    background: "rgba(54,168,138,0.12)",
                    border: "1px solid rgba(54,168,138,0.20)",
                  }}
                >
                  <Icon className="h-5 w-5" style={{ color: "#5ba88a" }} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                  {feature.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}