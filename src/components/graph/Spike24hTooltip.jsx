import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { ArrowUp, X } from "lucide-react";

const PALETTE = {
  surface: "#0c1314",
  cardBg: "#151d1e",
  muted: "#8a9496",
  green: "#58a97c",
  spike: "#E9A284",
  high: "#d4a056",
  low: "#e07a6b",
};

const WINDOW_MS = 30 * 60 * 1000;

function doseTime(dose) {
  return new Date(dose.administered_at || dose.created_at || dose.created_date).getTime();
}

function nearbyFor(spike, doses, carbEntries) {
  const t = new Date(spike.startTime).getTime();
  const dosesNear = (doses || []).filter((d) => Math.abs(doseTime(d) - t) <= WINDOW_MS);
  const carbsNear = (carbEntries || []).filter((c) => {
    const ct = new Date(c.consumed_at || c.created_date).getTime();
    return Math.abs(ct - t) <= WINDOW_MS;
  });
  return { dosesNear, carbsNear };
}

/**
 * Stackd-style modal tooltip for a spike (or bundled spikes) in the 24h view.
 * Reuses the same dark surface, typography, and animation language as the
 * Meal Balance tooltip. For bundles, each event is clearly separated.
 */
export default function Spike24hTooltip({ bundle, doses, carbEntries, onClose }) {
  const spikes = bundle.spikes || [];
  const count = spikes.length;
  const allHandled = spikes.every((s) => s.user_dismissed || s.user_tagged_cause);
  const accent = allHandled ? PALETTE.green : PALETTE.spike;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-4"
        onClick={onClose}
        style={{ background: "rgba(8,14,12,0.72)", backdropFilter: "blur(6px)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -6 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex max-h-[min(84dvh,640px)] w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border"
          style={{
            background: PALETTE.surface,
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-2 pt-4">
            <div className="flex items-start gap-2">
              <ArrowUp className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} strokeWidth={2.5} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white">
                  {count > 1 ? `Spike Events (${count})` : "Spike Event"}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
                  {count > 1 ? "A few meaningful rises grouped together." : "A meaningful rise in your flow."}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="transition-colors hover:text-white/80" style={{ color: PALETTE.muted }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            <div className="space-y-3">
              {spikes.map((s, i) => {
                const { dosesNear, carbsNear } = nearbyFor(s, doses, carbEntries);
                const doseUnits = dosesNear.reduce((sum, d) => sum + (Number(d.units) || 0), 0);
                const carbGrams = carbsNear.reduce((sum, c) => sum + (Number(c.carbs) || 0), 0);
                const startGlucose = Number(s.startGlucose);
                const peakGlucose = Number(s.peakGlucose);
                return (
                  <div key={i} className="rounded-xl border p-3" style={{ background: PALETTE.cardBg, borderColor: "rgba(255,255,255,0.06)" }}>
                    {count > 1 && (
                      <p className="mb-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                        Event {i + 1}
                      </p>
                    )}
                    <p className="text-xs font-semibold text-white">{format(new Date(s.startTime), "EEEE · h:mm a")}</p>
                    <p className="mt-1 text-base font-bold text-white">
                      {Number.isFinite(startGlucose) ? Math.round(startGlucose) : "—"}
                      <ArrowUp className="mx-1 inline h-3.5 w-3.5 align-text-bottom" style={{ color: accent }} />
                      {Number.isFinite(peakGlucose) ? Math.round(peakGlucose) : "—"}
                      <span className="ml-1 text-[10px] font-normal text-white/40">mg/dL</span>
                    </p>

                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-white/40">Peak</span>
                        <span className="font-semibold text-white">{Number.isFinite(peakGlucose) ? Math.round(peakGlucose) : "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40">Rise</span>
                        <span className="font-semibold" style={{ color: accent }}>+{Math.round(s.riseAmount || 0)}</span>
                      </div>
                      {s.peakTime && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Peak at</span>
                          <span className="font-semibold text-white">{format(new Date(s.peakTime), "h:mm a")}</span>
                        </div>
                      )}
                      {Number.isFinite(s.durationMinutes) && s.durationMinutes > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Duration</span>
                          <span className="font-semibold text-white">{Math.round(s.durationMinutes)}m</span>
                        </div>
                      )}
                    </div>

                    {(doseUnits > 0 || carbGrams > 0) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/5 pt-2.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Related</span>
                        {doseUnits > 0 && (
                          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-300/80">
                            {doseUnits.toFixed(doseUnits % 1 ? 1 : 0)}u {dosesNear[0]?.insulin_type?.split(" ")[0] || "support"}
                          </span>
                        )}
                        {carbGrams > 0 && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300/80">
                            {Math.round(carbGrams)}g {carbsNear[0]?.food_name || "nourishment"}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}