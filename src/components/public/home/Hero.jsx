import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import GlucosePreview from "@/components/public/previews/GlucosePreview";

/**
 * The opening scene: the person's daily experience first, with the app itself
 * as the only visual. Mobile-first, so the headline and both actions are
 * readable and tappable before anything else.
 */
export default function Hero() {
  return (
    <section className="px-4 pb-14 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-[11px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#dde5e8" }}
          >
            Glucose, insulin, meals and patterns
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-4 text-[34px] font-bold leading-[1.08] tracking-tight text-field-ink sm:text-5xl lg:text-[56px]"
          >
            Your day with diabetes,
            <br />
            brought together.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="mt-5 max-w-xl text-[15px] leading-relaxed text-field-muted sm:text-lg"
          >
            See glucose trends, logged insulin, meals, and patterns in one calm place. Keep the people you trust in the
            picture, with sharing you control.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              to="/register"
              className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-full bg-paper px-7 text-[15px] font-semibold text-ink transition-transform hover:opacity-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2] focus-visible:ring-offset-2 focus-visible:ring-offset-[#4c6770]"
            >
              Create an account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/how-it-works"
              className="inline-flex min-h-[50px] items-center justify-center rounded-full border border-white/30 px-7 text-[15px] font-semibold text-field-ink transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2]"
            >
              See how it works
            </Link>
          </motion.div>

          <p className="mt-6 max-w-md text-[13px] leading-relaxed text-field-muted">
            Works with a supported Dexcom Share account, or with readings you enter by hand. Stackd is a companion for
            recording and seeing your own information, not a medical device.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.15 }}
        >
          <GlucosePreview />
        </motion.div>
      </div>
    </section>
  );
}