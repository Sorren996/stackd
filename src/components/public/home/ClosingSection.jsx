import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

/** The closing scene: one clear action, and a quiet way back in. */
export default function ClosingSection() {
  return (
    <section className="px-4 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mx-auto w-full max-w-3xl text-center"
      >
        <h2 className="text-[28px] font-bold leading-[1.15] tracking-tight text-field-ink sm:text-4xl">
          Start where you are today.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-field-muted sm:text-base">
          Create an account and bring your glucose, your insulin and your meals into one calm place. You can decide
          later who else gets to see any of it.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/register"
            className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-paper px-7 text-[15px] font-semibold text-ink transition-transform hover:opacity-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2] sm:w-auto"
          >
            Create an account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            to="/login"
            className="inline-flex min-h-[50px] w-full items-center justify-center rounded-full border border-white/30 px-7 text-[15px] font-semibold text-field-ink transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fdf9f2] sm:w-auto"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-5 text-[13px] text-field-muted">
          Received an invitation to follow someone?{" "}
          <Link to="/sharing" className="font-semibold underline decoration-[#fdf9f2]/40 underline-offset-4" style={{ color: "#fdf9f2" }}>
            Here is how that works
          </Link>
          .
        </p>
      </motion.div>
    </section>
  );
}