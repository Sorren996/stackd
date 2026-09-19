import { CheckCircle2, Clock } from "lucide-react";

const RESCUE_COLOR = "#a78bfa";
const PALETTE = {
  green: "#58a97c",
  amber: "#d4a056",
  muted: "#8a9496",
};

const TREND_ARROW = {
  up: "↑",
  "up-right": "↗",
  right: "→",
  "down-right": "↘",
  down: "↓",
};

function formatElapsed(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function SectionLabel({ children }) {
  return <p className="stackd-section-label">{children}</p>;
}

function DetailRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] text-white/50">{label}</span>
      <span className="text-[13px] font-bold" style={{ color: color || "rgba(255,255,255,0.9)" }}>
        {value}
      </span>
    </div>
  );
}

function SummaryCell({ label, value, sub }) {
  return (
    <div className="flex flex-col items-center px-1 text-center">
      <p className="text-lg font-bold text-white whitespace-nowrap">{value}</p>
      <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/40">{label}</p>
      {sub && <p className="mt-0.5 text-[9px]" style={{ color: PALETTE.muted }}>{sub}</p>}
    </div>
  );
}

function fmtUnits(v) {
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

/**
 * Meal Review — redesigned for clarity and calm. Numbers first, short labels,
 * minimal supporting text. No AI-style language. Rescue carbs shown in purple
 * and never included in insulin figures.
 */
export default function MealReviewContent({ mealInsight, monitoringStatus, glucoseTrend, onResolve }) {
  if (!mealInsight) return null;

  const d = mealInsight.details;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;
  const trendColor = glucoseTrend?.color || PALETTE.muted;

  // ── NO ACTIVE MEAL ──────────────────────────────────────────────
  // Show a lightweight current-state view. No meal calculations, no
  // estimates, no artificial analysis.
  if (!d || d.noActiveMeal) {
    const glucose = d?.latestGlucoseValue;
    const hasGlucose = Number.isFinite(glucose);
    const activeInsulin = d?.activeInsulin || 0;
    const recentCarbs = d?.recentNormalCarbs || 0;
    const rescueCarbs = d?.rescueCarbs || 0;

    return (
      <div className="space-y-5 p-1">
        {/* Current Glucose */}
        <section>
          <SectionLabel>Current Glucose</SectionLabel>
          <div className="mt-2 flex items-baseline gap-2">
            {hasGlucose ? (
              <>
                <span className="text-3xl font-black text-white">{Math.round(glucose)}</span>
                <span className="text-[11px] text-white/40">mg/dL</span>
                {trendArrow && (
                  <span className="ml-0.5 text-lg font-bold" style={{ color: trendColor }}>
                    {trendArrow}
                  </span>
                )}
              </>
            ) : (
              <span className="text-lg text-white/40">No recent reading</span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-white/40">No active meal</p>
        </section>

        {/* Insulin on Board */}
        {activeInsulin > 0.01 && (
          <section>
            <SectionLabel>Insulin on Board</SectionLabel>
            <p className="mt-2 text-2xl font-bold text-white">{fmtUnits(activeInsulin)}u</p>
          </section>
        )}

        {/* Recent Carbs */}
        {recentCarbs > 0 && (
          <section>
            <SectionLabel>Recent Carbs</SectionLabel>
            <p className="mt-2 text-2xl font-bold text-white">{recentCarbs}g</p>
          </section>
        )}

        {/* Rescue Carbs */}
        {rescueCarbs > 0 && (
          <section>
            <SectionLabel>Rescue Carbs</SectionLabel>
            <p className="mt-2 text-2xl font-bold" style={{ color: RESCUE_COLOR }}>
              {rescueCarbs}g
            </p>
          </section>
        )}

        {/* Nothing to show */}
        {!hasGlucose && activeInsulin <= 0.01 && recentCarbs === 0 && rescueCarbs === 0 && (
          <p className="text-sm text-white/35">
            {mealInsight.value === "Setup needed"
              ? "Add your insulin settings to see meal balance."
              : "Log a meal to open a review window."}
          </p>
        )}
      </div>
    );
  }

  // ── SETUP STATE ────────────────────────────────────────────────
  if (!d.meal) {
    const needsSetup = mealInsight.value === "Setup needed";
    return (
      <div className="space-y-3 p-1">
        <SectionLabel>Meal Review</SectionLabel>
        <p className="text-sm font-semibold text-white/75">{mealInsight.value}</p>
        <p className="text-[11px] leading-relaxed text-white/40">
          {needsSetup
            ? "Add your insulin-to-carb ratio and sensitivity in Settings to see meal balance."
            : "Log a meal to open a review window."}
        </p>
      </div>
    );
  }

  // ── ACTIVE MEAL ────────────────────────────────────────────────
  const carbs = Math.round(d.meal?.carbs || 0);
  const rescueCarbs = d.rescueCarbs || 0;
  const loggedUnits = d.loggedTotalUnits || 0;
  const remainingEstimate = d.estimatedAdditionalUnits || 0;
  const activeInsulin = d.bolusIOB || 0;
  const peakOutcome = d.peakOutcome;
  const peakOutcomeTime = d.peakOutcomeTime;
  const mealTime = d.meal?.time;
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const hasCurrentGlucose = Number.isFinite(glucoseNow);

  const elapsedMs = Number.isFinite(mealTime) ? Date.now() - mealTime : null;
  const peakAfterMs = Number.isFinite(peakOutcomeTime) && Number.isFinite(mealTime) ? peakOutcomeTime - mealTime : null;

  return (
    <div className="space-y-5 p-1">
      {/* Current Glucose */}
      {hasCurrentGlucose && (
        <section>
          <SectionLabel>Current Glucose</SectionLabel>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white">{Math.round(glucoseNow)}</span>
            <span className="text-[11px] text-white/40">mg/dL</span>
            {trendArrow && (
              <span className="ml-0.5 text-lg font-bold" style={{ color: trendColor }}>
                {trendArrow}
              </span>
            )}
          </div>
          {elapsedMs !== null && (
            <p className="mt-1 text-[11px] text-white/40">{formatElapsed(elapsedMs)} since meal</p>
          )}
        </section>
      )}

      {/* Meal Summary */}
      <section>
        <SectionLabel>Meal</SectionLabel>
        <div className="mt-2.5 grid grid-cols-3 divide-x divide-white/[0.06]">
          <SummaryCell label="Carbs" value={`${carbs}g`} />
          <SummaryCell label="Insulin" value={`${fmtUnits(loggedUnits)}u`} />
          <SummaryCell
            label="Peak"
            value={Number.isFinite(peakOutcome) ? Math.round(peakOutcome) : "—"}
            sub={peakAfterMs !== null ? `${formatElapsed(peakAfterMs)} after` : null}
          />
        </div>
        {rescueCarbs > 0 && (
          <p className="mt-2 text-[11px] font-medium" style={{ color: RESCUE_COLOR }}>
            + {rescueCarbs}g rescue
          </p>
        )}
      </section>

      {/* Meal Details */}
      <section>
        <SectionLabel>Details</SectionLabel>
        <div className="mt-1">
          <DetailRow label="Carbs" value={`${carbs}g`} />
          {rescueCarbs > 0 && (
            <DetailRow label="Rescue carbs" value={`${rescueCarbs}g`} color={RESCUE_COLOR} />
          )}
          <DetailRow label="Insulin" value={`${fmtUnits(loggedUnits)}u`} />
          <DetailRow label="Insulin on board" value={`${fmtUnits(activeInsulin)}u`} />
          {remainingEstimate > 0.01 && (
            <DetailRow label="Remaining" value={`${fmtUnits(remainingEstimate)}u`} color={mealInsight.color} />
          )}
        </div>
      </section>

      {/* High protein/fat monitoring notice */}
      {monitoringStatus?.isActive && (
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "rgba(217,169,56,0.2)", background: "rgba(217,169,56,0.05)" }}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
            <p className="text-[11px] font-semibold text-amber-400/90">Delayed meal response possible</p>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">
            Continue monitoring through{" "}
            <span className="font-medium text-amber-400/70">
              {new Date(monitoringStatus.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
            .
          </p>
        </div>
      )}

      {/* Mark as Resolved */}
      {d.mealStillUnderReview && onResolve && (
        <button
          type="button"
          onClick={onResolve}
          className="flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-[12px] font-semibold transition hover:brightness-110"
          style={{
            borderColor: `${PALETTE.green}40`,
            background: `${PALETTE.green}12`,
            color: PALETTE.green,
          }}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
          Mark as Resolved
        </button>
      )}
    </div>
  );
}