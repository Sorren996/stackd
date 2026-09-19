import { motion } from "framer-motion";
import { Download, Eye, Settings, GitBranch, CheckCircle } from "lucide-react";

const STEPS = [
  {
    icon: Download,
    title: "Bring in your readings.",
    body: "Connect your Dexcom once and readings flow in automatically, or log them by hand. Both paths lead to the same review.",
  },
  {
    icon: Eye,
    title: "Review your readings.",
    body: "See where your glucose is, where it's been, and where it's heading, whether the numbers came from your Dexcom or your own log.",
  },
  {
    icon: Settings,
    title: "Confirm your settings.",
    body: "Walk through your insulin settings as they stand today, so your dose is based on what's actually current, not what you remember setting up.",
  },
  {
    icon: GitBranch,
    title: "Check your split dose plan.",
    body: "If you split doses, Stackd shows you exactly where you stand, including what's already on board.",
  },
  {
    icon: CheckCircle,
    title: "Dose with clarity.",
    body: "Every input, reviewed in order, before you commit. That's the whole promise.",
  },
];

export default function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="px-4 py-20 md:py-28">
      <div className="mx-auto max-w-3xl">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
        >
          One guided flow, from open to dosed.
        </motion.h2>

        <div className="mt-12 space-y-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="flex gap-4"
              >
                {/* Number + icon */}
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                    style={{
                      background:
                        "linear-gradient(145deg, rgba(54,168,138,0.92), rgba(46,140,116,0.92))",
                      boxShadow: "0 4px 14px rgba(54,168,138,0.25)",
                    }}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="my-1 w-px flex-1 bg-white/10" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-8">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-white">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/55">
                    {step.body}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}