import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { HIGH_PROTEIN_FAT_MONITORING_HOURS } from "@/lib/mealMonitoring";

export default function HighProteinFatInfoModal({ open, onClose }) {
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  const scrollRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const timer = setTimeout(() => closeRef.current?.focus(), 80);

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    scrollRef.current = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollRef.current}px`;
    document.body.style.width = "100%";

    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollRef.current);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[500] flex items-center justify-center p-4"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="High protein and high fat meals"
      >
        <div className="fixed inset-0 bg-black/80" aria-hidden="true" />
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative z-10 flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-3xl border shadow-2xl"
          style={{
            background: "linear-gradient(165deg, rgba(18,28,23,0.97), rgba(10,16,13,0.98))",
            borderColor: "rgba(255,255,255,0.14)",
            boxShadow:
              "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)",
          }}
        >
          <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-5">
            <h2 className="text-base font-bold text-white">
              High protein and high fat meals
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border text-white/60 transition hover:text-white"
              style={{
                background: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
              }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-5"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-4 text-[13px] leading-relaxed text-white/60">
              <p>
                Meals containing substantial protein, fat, or both may affect
                glucose differently from meals made mostly of carbohydrates.
              </p>
              <p>
                Their glucose effect may be delayed and can sometimes appear
                several hours after eating. Some people may notice a gradual
                rise, a prolonged trend, or a response that is different from
                what they normally expect.
              </p>
              <p>
                A meal containing approximately 70 grams or more of protein may
                be considered high protein for some people, but there is no
                universal threshold. Smaller amounts may still affect glucose
                depending on the person, the amount of fat, the carbohydrate
                content, meal size, digestion, activity, and insulin already
                active.
              </p>
              <p>
                Marking this meal will add a{" "}
                {HIGH_PROTEIN_FAT_MONITORING_HOURS}-hour monitoring caution to
                the Meal Balance card. It does not change carbohydrate totals,
                insulin calculations, insulin-on-board values, or dose
                estimates.
              </p>
              <p className="font-medium text-white/70">
                Do not take additional insulin solely because this option is
                selected. Continue following your established diabetes treatment
                plan and monitor your glucose response. Avoid repeated
                corrections too close together, and account for insulin already
                active according to your care plan.
              </p>
              <p>
                Seek guidance from your diabetes clinician if you frequently
                experience delayed highs or lows after high-protein or high-fat
                meals.
              </p>

              <div
                className="rounded-2xl border p-4"
                style={{
                  borderColor: "rgba(217,169,56,0.25)",
                  background: "rgba(217,169,56,0.06)",
                }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400/80" />
                  <span className="text-sm font-semibold text-amber-300/90">
                    Monitoring reminder
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-white/50">
                  Glucose responses to protein and fat are highly individual.
                  This feature identifies a period for closer observation; it
                  does not predict whether glucose will rise or how much it may
                  change.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition"
              style={{
                background:
                  "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
                boxShadow:
                  "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)",
              }}
            >
              Understood
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}