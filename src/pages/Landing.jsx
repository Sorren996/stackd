import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import ProblemVisual from "@/components/landing/ProblemVisual";
import ReviewShowcase from "@/components/landing/ReviewShowcase";
import InfoLayers from "@/components/landing/InfoLayers";
import LandingFAQ from "@/components/landing/LandingFAQ";
import InstallGuide from "@/components/landing/InstallGuide";
import LandingFooter from "@/components/landing/LandingFooter";
import HeroShowcase from "@/components/landing/HeroShowcase";

export default function Landing() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = ""; };
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#f7f1e8" }}>
      <LandingNav />
      <LandingHero />

      {/* SECTION 2 — PROBLEM */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            The problem isn't insulin. It's doing everything else at once.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-center text-sm leading-relaxed text-white/55 md:text-base"
          >
            Before a dose, you're juggling a glucose reading, active insulin,
            carb counts, your settings, and what you remember from the last dose.
            Stackd brings the relevant pieces together.
          </motion.p>

          <ProblemVisual />
        </div>
      </section>

      {/* SECTION 3 — GUIDED REVIEW */}
      <section id="how-it-works" className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            One review. Everything that matters.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-center text-sm leading-relaxed text-white/55 md:text-base"
          >
            Stackd walks you through the information that matters before a dose,
            so you can review it without piecing everything together yourself.
          </motion.p>

          <ReviewShowcase />

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-10 text-center text-sm font-semibold text-white/50"
          >
            Everything checked. Nothing unnecessary.
          </motion.p>
        </div>
      </section>

      {/* SECTION 4 — CORE INFORMATION */}
      <section id="features" className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-2xl">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            The information that matters, together.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-lg text-center text-sm leading-relaxed text-white/55 md:text-base"
          >
            Stackd brings five layers of information into one review — so you
            see the full picture without opening multiple apps or relying on
            memory.
          </motion.p>

          <InfoLayers />
        </div>
      </section>

      {/* SECTION 5 — THE DIFFERENCE */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            More than a log.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 md:text-base"
          >
            Stackd doesn't just record what happened. It organizes the
            information you already have into a review you can actually use.
          </motion.p>
        </div>
      </section>

      {/* SECTION 6 — DEXCOM + MANUAL LOGGING */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            Use the data you already have.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/55 md:text-base"
          >
            Connect a supported Dexcom account for glucose data, or log
            readings manually when you prefer. Both paths lead to the same
            review.
          </motion.p>
        </div>
      </section>

      {/* SECTION 7 — PRODUCT STATEMENT (replaces testimonials) */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-5xl">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            Built around the moment before the dose.
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="mx-auto mt-10 max-w-md"
          >
            <HeroShowcase />
          </motion.div>
        </div>
      </section>

      {/* SECTION 8 — FAQ */}
      <LandingFAQ />

      {/* SECTION 9 — INSTALLATION / PWA */}
      <InstallGuide />

      {/* SECTION 10 — FINAL CTA */}
      <section className="px-4 py-24 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Ready to see what's there before you dose?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55 md:text-base">
            Start your review with Stackd.
          </p>
          <Link
            to="/register"
            className="mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold transition-transform active:scale-95"
            style={{ background: "#9c5228", color: "#f7f1e8" }}
          >
            Try Stackd
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      <LandingFooter />
    </div>
  );
}