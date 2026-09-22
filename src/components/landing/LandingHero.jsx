import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import HeroShowcase from "./HeroShowcase";

export default function LandingHero() {
  return (
    <section id="top" className="relative overflow-hidden px-4 pt-12 pb-16 md:pt-20 md:pb-24">
      {/* Ambient warmth — flat sandstone wash, no gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(253, 249, 242, 0.6)" }}
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          {/* Left — copy */}
          <div className="text-center lg:text-left">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl font-bold leading-tight tracking-tight text-white md:text-5xl lg:text-6xl"
            >
              Dose with clarity.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mx-auto mt-5 max-w-md text-base leading-relaxed text-white/60 md:text-lg lg:mx-0"
            >
              Everything you need to review before a dose, in one guided flow.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
            >
              <Link
                to="/register"
                className="stackd-btn-primary inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-transform active:scale-95"
              >
                Try Stackd
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-8 py-3.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
              >
                See how it works
              </a>
            </motion.div>
          </div>

          {/* Right — product showcase */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <HeroShowcase />
          </motion.div>
        </div>
      </div>
    </section>
  );
}