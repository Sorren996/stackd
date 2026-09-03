import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { useSensorSession } from "@/hooks/useSensorSession";
import {
  SENSOR_MODELS,
  SENSOR_MODEL_IDS,
  formatRemaining,
  getSensorSessionEndMs,
  isSessionExpired,
} from "@/lib/sensorSession";

const DAY_MS = 24 * 60 * 60 * 1000;
const COLOR_FRESH = "#5ba88a";
const COLOR_NEAR = "#d9a938";

function toLocalDatetimeInputValue(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sessionColor(remainingMs) {
  if (remainingMs === null || remainingMs <= 0) return COLOR_NEAR;
  return remainingMs < DAY_MS ? COLOR_NEAR : COLOR_FRESH;
}

export default function SensorSessionCard() {
  const { modelId, startedAt, modelMeta, remainingMs, save, isSaving } = useSensorSession();
  const [expanded, setExpanded] = useState(false);
  const [draftModel, setDraftModel] = useState("G7");
  const [draftStartedAt, setDraftStartedAt] = useState(() => toLocalDatetimeInputValue(Date.now()));

  useEffect(() => {
    if (expanded) {
      setDraftModel(modelId || "G7");
      setDraftStartedAt(startedAt ? toLocalDatetimeInputValue(startedAt) : toLocalDatetimeInputValue(Date.now()));
    }
  }, [expanded, modelId, startedAt]);

  const hasSession = Boolean(modelId && startedAt && remainingMs !== null);
  const remaining = hasSession ? formatRemaining(remainingMs) : null;
  const expired = hasSession && isSessionExpired(remainingMs);

  const totalMs = modelMeta ? modelMeta.durationDays * DAY_MS : 0;
  const endMs = hasSession ? getSensorSessionEndMs(modelId, startedAt) : null;
  const elapsedMs = hasSession ? totalMs - remainingMs : 0;
  const progressPct = hasSession && totalMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)) : 0;
  const color = sessionColor(remainingMs);

  const handleSave = () => {
    const ms = new Date(draftStartedAt).getTime();
    if (!Number.isFinite(ms)) return;
    save({
      cgm_model: draftModel,
      sensor_session_started_at: new Date(ms).toISOString(),
    });
    setExpanded(false);
  };

  const handleEndSession = () => {
    save({
      cgm_model: null,
      sensor_session_started_at: null,
    });
    setExpanded(false);
  };

  return (
    <div className="space-y-2">
      <h2 className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
        Sensor Session
      </h2>
      <motion.div
        animate={expanded ? {
          boxShadow: `0 0 0 1px ${color}55, 0 0 22px ${color}25`,
          borderColor: `${color}55`,
        } : {
          boxShadow: "0 0 0 1px rgba(255,255,255,0.07), 0 0 0px transparent",
          borderColor: "rgba(255,255,255,0.07)",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="overflow-hidden rounded-2xl border bg-white/[0.025] backdrop-blur-sm"
        style={{ borderColor: "rgba(255,255,255,0.07)" }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-stretch gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03] active:scale-[0.995]"
        >
          <div className="flex h-24 w-24 shrink-0 items-center justify-center">
            <img
              src={modelMeta?.image || SENSOR_MODELS.G7.image}
              alt={modelMeta?.label || "Dexcom sensor"}
              className="h-full w-full object-contain"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            {hasSession ? (
              <>
                <div className="relative mb-2 h-1.5 w-full rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${progressPct}%`,
                      background: `linear-gradient(90deg, ${color}30, ${color}90)`,
                      boxShadow: `0 0 6px ${color}80`,
                    }}
                  />
                  <div className="pointer-events-none absolute inset-y-0" style={{ left: `${progressPct}%` }}>
                    <div className="h-full w-px -translate-x-1/2" style={{ background: `${color}80` }} />
                    <div
                      className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                      style={{ boxShadow: `0 0 4px ${color}, 0 0 8px ${color}90` }}
                    />
                  </div>
                </div>
                <p className={`text-base font-bold leading-tight ${expired ? "text-amber-200" : "text-white"}`}>
                  {remaining?.text}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/40">
                  {modelMeta?.label}
                  {startedAt ? ` · ${format(new Date(startedAt), "MMM d")}` : ""}
                </p>
                {endMs && (
                  <p className="mt-0.5 truncate text-[10px] text-white/30">
                    Expires {format(new Date(endMs), "MMM d · h:mm a")}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white">Start your sensor session</p>
                <p className="mt-0.5 truncate text-[11px] text-white/40">
                  Track how long your current sensor has left
                </p>
              </>
            )}
          </div>

          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="flex items-start pt-1">
            <ChevronDown className="h-4 w-4 shrink-0 text-white/30" />
          </motion.span>
        </button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key={hasSession ? "end-session" : "start-session"}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden border-t border-white/[0.05]"
            >
              {hasSession ? (
                <div className="px-3.5 py-4">
                  <button
                    type="button"
                    onClick={handleEndSession}
                    disabled={isSaving}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    {isSaving ? "Ending..." : "End session"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 px-3.5 py-4">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                      Dexcom model
                    </p>
                    <div className="space-y-1.5">
                      {SENSOR_MODEL_IDS.map((id) => {
                        const m = SENSOR_MODELS[id];
                        const selected = draftModel === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDraftModel(id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 transition ${
                              selected
                                ? "border-teal-500/40 bg-teal-500/10"
                                : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05]"
                            }`}
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                              <img src={m.image} alt={m.label} className="h-full w-full object-contain" />
                            </div>
                            <span className={`flex-1 text-left text-sm font-medium ${selected ? "text-white" : "text-white/70"}`}>
                              {m.label}
                            </span>
                            <span className="text-[11px] text-white/35">{m.durationDays} days</span>
                            {selected && <Check className="h-4 w-4 shrink-0 text-teal-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                      Session start
                    </p>
                    <input
                      type="datetime-local"
                      value={draftStartedAt}
                      onChange={(e) => setDraftStartedAt(e.target.value)}
                      className="w-full rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none transition focus:border-teal-500/40"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="flex-1 rounded-xl border border-white/12 bg-white/[0.03] py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.06]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/15 py-2.5 text-sm font-semibold text-teal-200 transition hover:bg-teal-500/25 disabled:opacity-60"
                    >
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {isSaving ? "Saving..." : "Save session"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}