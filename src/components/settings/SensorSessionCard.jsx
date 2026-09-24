import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { useSensorSession } from "@/hooks/useSensorSession";
import { useUserSettings } from "@/hooks/useUserSettings";
import {
  SENSOR_MODELS,
  SENSOR_MODEL_IDS,
  formatRemaining,
  getSensorSessionEndMs,
  isSessionExpired,
} from "@/lib/sensorSession";
import SensorDayTrail from "@/components/settings/SensorDayTrail";

const DAY_MS = 24 * 60 * 60 * 1000;
const COLOR_FRESH = "#5b6550";
const COLOR_NEAR = "#af751b";

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
  const { modelId, startedAt, modelMeta, remainingMs } = useSensorSession();
  const { save, isSaving } = useUserSettings();
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
      <h2
        className="px-1 text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "#eadccf", paddingBottom: "6px", borderBottom: "1px solid rgba(234,220,207,0.3)" }}
      >
        Sensor Session
      </h2>
      <motion.div
        animate={expanded ? {
          borderColor: `${color}55`,
        } : {
          borderColor: "#eadccf",
        }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="overflow-hidden rounded-2xl border"
        style={{ background: "#fdf9f2", borderColor: "#eadccf" }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-stretch gap-3 px-3.5 py-3 text-left transition hover:opacity-70 active:scale-[0.995]"
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
                <p className="text-base font-bold leading-tight" style={{ color: expired ? "#af751b" : "#3f3830" }}>
                  {remaining?.text}
                </p>
                <p className="mt-0.5 truncate text-[11px]" style={{ color: "#746959" }}>
                  {modelMeta?.label}
                </p>
                <div className="mt-2.5">
                  <SensorDayTrail
                    totalDays={modelMeta?.durationDays}
                    remainingDays={remaining?.days ?? 0}
                    expired={expired}
                  />
                </div>
                {remaining?.grace && (
                  <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: "#af751b" }}>
                    Grace period — sensor may still read. Have your next one ready.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>Start your sensor session</p>
                <p className="mt-0.5 truncate text-[11px]" style={{ color: "#746959" }}>
                  Track how long your current sensor has left
                </p>
              </>
            )}
          </div>

          <span className="flex items-start pt-1">
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex"
              style={{ transformOrigin: "50% 50%" }}
            >
              <ChevronDown className="h-4 w-4 shrink-0" style={{ color: "#746959" }} />
            </motion.span>
          </span>
        </button>

        {hasSession && (
          <div className="flex items-center justify-between gap-3 border-t px-3.5 py-2.5" style={{ borderColor: "#eadccf" }}>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#6b6153" }}>Started</p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: "#6b6153" }}>
                {startedAt ? format(new Date(startedAt), "MMM d · h:mm a") : "—"}
              </p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: "#6b6153" }}>Expires</p>
              <p className="mt-0.5 truncate text-[11px]" style={{ color: "#6b6153" }}>
                {endMs ? format(new Date(endMs), "MMM d · h:mm a") : "—"}
              </p>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key={hasSession ? "end-session" : "start-session"}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden border-t" style={{ borderColor: "#eadccf" }}
            >
              {hasSession ? (
                <div className="px-3.5 py-4">
                  <button
                    type="button"
                    onClick={handleEndSession}
                    disabled={isSaving}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition disabled:opacity-60"
                    style={{ borderColor: "rgba(201,112,96,0.25)", background: "rgba(201,112,96,0.08)", color: "#c97060" }}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    {isSaving ? "Ending..." : "End session"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 px-3.5 py-4">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
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
                            className="flex w-full items-center gap-3 rounded-xl border px-3 py-2 transition"
                            style={selected
                              ? { borderColor: "rgba(91,101,80,0.40)", background: "rgba(91,101,80,0.10)" }
                              : { borderColor: "#eadccf", background: "#f7f1e8" }
                            }
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center">
                              <img src={m.image} alt={m.label} className="h-full w-full object-contain" />
                            </div>
                            <span className="flex-1 text-left text-sm font-medium" style={{ color: selected ? "#3f3830" : "#6b6153" }}>
                              {m.label}
                            </span>
                            <span className="text-[11px]" style={{ color: "#746959" }}>{m.durationDays} days</span>
                            {selected && <Check className="h-4 w-4 shrink-0" style={{ color: "#5b6550" }} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
                      Session start
                    </p>
                    <input
                      type="datetime-local"
                      value={draftStartedAt}
                      onChange={(e) => setDraftStartedAt(e.target.value)}
                      className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition"
                      style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#3f3830" }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(false)}
                      className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition"
                      style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#6b6153" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition disabled:opacity-60"
                      style={{ borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.12)", color: "#5b6550" }}
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