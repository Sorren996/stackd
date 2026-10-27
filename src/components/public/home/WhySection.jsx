import { motion } from "framer-motion";
import PublicSection from "@/components/public/PublicSection";

const THREADS = ["A reading", "Insulin you logged", "What you ate", "How the morning went", "A note to yourself"];

/**
 * Why the app exists. The visual is a composition of the separate pieces
 * converging into one place, not a grid of feature cards.
 */
export default function WhySection() {
  return (
    <PublicSection
      tone="paper"
      eyebrow="Why Stackd exists"
      title="It is never just one number."
      lede="A reading on your sensor. Insulin you logged an hour ago. What you ate, and when. How the morning actually went. Each piece lives somewhere different, and you are the one holding them all at once."
    >
      <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
        <div className="flex flex-wrap gap-2.5">
          {THREADS.map((thread, i) => (
            <motion.span
              key={thread}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="rounded-full bg-paper px-4 py-2.5 text-[13px] font-medium text-ink-muted"
              style={{ border: "1px solid #eadccf" }}
            >
              {thread}
            </motion.span>
          ))}
          <p className="w-full pt-3 text-sm leading-relaxed text-ink-muted">
            Stackd brings them into one place, so you are reading your day instead of assembling it.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="w-full rounded-3xl bg-paper-sunk p-6 lg:w-[320px]"
          style={{ border: "1px solid #eadccf" }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">One place to look</p>
          <p className="mt-3 text-[15px] leading-relaxed text-ink">
            Glucose and trend, daily balance, the timeline of what happened, the meals you logged and the notes you
            wrote, together in the order your day happened.
          </p>
        </motion.div>
      </div>
    </PublicSection>
  );
}