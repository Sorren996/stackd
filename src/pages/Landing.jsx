import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingHero from "@/components/landing/LandingHero";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingFAQ from "@/components/landing/LandingFAQ";
import InstallGuide from "@/components/landing/InstallGuide";
import LandingFooter from "@/components/landing/LandingFooter";

const STATS = ["19-page guided flow", "Dexcom optional", "Manual logs welcome", "Split-dose aware"];

export default function Landing() {
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => { document.documentElement.style.scrollBehavior = ""; };
  }, []);

  return (
    <div className="min-h-screen">
      <LandingNav />
      <LandingHero />

      {/* PROBLEM SECTION */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            Dosing shouldn't feel like guesswork.
          </motion.h2>
          <div className="mt-6 space-y-4">
            <p className="text-sm leading-relaxed text-white/55 md:text-base">
              If you dose insulin, you know the moment. It's mealtime, or a
              correction, or a long day catching up with you. And the decision in
              front of you pulls from everywhere at once: the number on your
              meter or CGM, the arrows and trend, whatever you remember about
              your active insulin, the correction factor and carb ratio from
              months ago, the half of the split dose you already took, the IOB
              that's still working.
            </p>
            <p className="text-sm leading-relaxed text-white/55 md:text-base">
              Half of that lives in one app. Half lives in your head. Some of it
              is on a paper in a drawer, and some of it was never written down
              anywhere.
            </p>
            <p className="text-sm leading-relaxed text-white/55 md:text-base">
              So you do the math under time pressure, from memory, with your
              health riding on it. Everyone forgets a variable sometimes.
              Everyone second-guesses the math. And when you're done, there's no
              record of what you considered, just the dose itself.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="mt-10 rounded-2xl p-5"
            style={{
              background: "rgba(54,168,138,0.06)",
              border: "1px solid rgba(54,168,138,0.15)",
            }}
          >
            <p className="text-lg font-semibold text-white">
              The problem isn't insulin. It's doing everything else at once.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              Stackd exists because the moments before a dose deserve the same
              care as the dose itself. We built a guided flow that makes sure
              you've looked at every input that matters. You don't have to
              remember the checklist. The checklist remembers you.
            </p>
          </motion.div>
        </div>
      </section>

      <LandingHowItWorks />
      <LandingFeatures />

      {/* DEPTH SECTION */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            Thorough where it counts. Nothing else.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/55 md:text-base"
          >
            Stackd's guided flow spans 19 pages, each one a deliberate step in
            the review before you dose. Every page earns its place: if it isn't
            something worth checking, it isn't in the flow. The result is a
            review that feels complete in minutes, not a dashboard you have to
            decode.
          </motion.p>
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="px-4 py-20 md:py-28">
        <div className="mx-auto max-w-4xl">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="text-center text-2xl font-bold tracking-tight text-white md:text-4xl"
          >
            What dosing with clarity sounds like.
          </motion.h2>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {[
              {
                quote: "For the first time, I'm not doing mental math at the table. The flow just takes me through it.",
                attr: "Name, living with type 1 since 20XX",
              },
              {
                quote: "I split my doses and always lost track of the first half. Now I don't.",
                attr: "Name, caregiver",
              },
            ].map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-2xl p-5"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px dashed rgba(255,255,255,0.15)",
                }}
              >
                <span
                  className="inline-block rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.40)",
                  }}
                >
                  Placeholder
                </span>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  "{t.quote}"
                </p>
                <p className="mt-3 text-xs font-medium text-white/40">— {t.attr}</p>
              </motion.div>
            ))}
          </div>

          {/* Stat band */}
          <div
            className="mt-8 flex flex-col items-center gap-3 rounded-2xl px-6 py-5 sm:flex-row sm:justify-center sm:gap-0"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {STATS.map((stat, i) => (
              <div key={i} className="flex items-center sm:gap-0">
                <span className="text-xs font-semibold text-white/60 sm:px-5">
                  {stat}
                </span>
                {i < STATS.length - 1 && (
                  <span className="hidden text-white/15 sm:inline">|</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <LandingFAQ />

      <InstallGuide />

      {/* FINAL CTA */}
      <section className="px-4 py-24 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl rounded-3xl p-8 text-center md:p-12"
          style={{
            background: "rgba(54,168,138,0.06)",
            border: "1px solid rgba(54,168,138,0.15)",
            boxShadow: "0 12px 40px rgba(54,168,138,0.08)",
          }}
        >
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            The next dose is coming. Be ready for it.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55 md:text-base">
            Create a free account and walk through your first guided review. See
            what it feels like to dose with every input checked.
          </p>
          <Link
            to="/register"
            className="stackd-btn-primary mt-8 inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white transition-transform active:scale-95"
          >
            Get started free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </section>

      <LandingFooter />
    </div>
  );
}