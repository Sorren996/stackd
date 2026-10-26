import { Sparkles, X } from "lucide-react";
import Sheet from "@/components/Sheet";
import { activeInsulinDoses, computeSharedActiveInsulin, sharedBasalSummary } from "@/lib/sharing/followerInsulin";
import { describeProjectionReason } from "@/lib/sharing/sharingCopy";

const INK = "#3f3830";
const MUTED = "#746959";
const ACCENT = "#4C6770";
const HAIRLINE = "#eadccf";

function timeLabel(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * One dose that is still acting.
 *
 * Name, logged amount, when it was logged, the patient engine's own plain stage
 * for it, a simple progress line and — where the model supports a countdown —
 * roughly how long is left. Basal doses use the basal engine's own stages, so
 * none of them is described as though it had a rapid-acting peak.
 */
function ActiveDoseRow({ dose }) {
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: INK }}>
          {dose.insulin_type}
        </span>
        <span className="shrink-0 text-sm tabular-nums" style={{ color: INK }}>
          {dose.units} u
        </span>
      </div>

      <p className="pt-0.5 text-[11px]" style={{ color: MUTED }}>
        Logged {timeLabel(dose.administered_at) || "at an unrecorded time"}
      </p>

      <div className="pt-2">
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: "rgba(116,105,89,0.18)" }}
          role="img"
          aria-label={`${dose.stage}, about ${Math.round(dose.progress * 100)} percent of its action elapsed`}
        >
          <div
            style={{
              width: `${Math.round(dose.progress * 100)}%`,
              height: "100%",
              background: ACCENT,
              borderRadius: 999,
            }}
          />
        </div>
        <p className="pt-1.5 text-xs" style={{ color: INK }}>
          {dose.stage}
          {dose.remaining_label ? <span style={{ color: MUTED }}> · about {dose.remaining_label} left</span> : null}
        </p>
      </div>
    </div>
  );
}

/**
 * What is active right now, read-only.
 *
 * Only doses that are genuinely still acting appear — one whose own action has
 * finished, one dated in the future and one with no usable amount are all left
 * out. There is no dose history, no window count and no latest-dose line here:
 * this sheet describes the active picture and nothing else.
 */
export default function SharedInsulinSheet({ open, onClose, insulin, reason, sharerLabel }) {
  const now = Date.now();
  const available = insulin?.dose_math_available === true;
  const active = available ? activeInsulinDoses(insulin?.doses, now) : [];
  const estimate = computeSharedActiveInsulin(insulin?.doses, now, { doseMathAvailable: available });
  const basal = available ? sharedBasalSummary(insulin?.doses, now) : null;
  const rapid = active.filter((dose) => dose.is_rapid);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex shrink-0 items-start justify-between gap-3 px-6 pb-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold" style={{ color: INK }}>
            Active insulin
          </h2>
          <p className="pt-0.5 text-xs" style={{ color: MUTED }}>
            What is acting for {sharerLabel} right now.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-full p-2"
          style={{ background: "rgba(116,105,89,0.10)" }}
          aria-label="Close"
        >
          <X className="h-4 w-4" style={{ color: INK }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {!insulin ? (
          <p className="text-sm" style={{ color: MUTED }}>
            {describeProjectionReason(reason)}
          </p>
        ) : (
          <>
            <div className="rounded-2xl border p-4" style={{ borderColor: HAIRLINE }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUTED }}>
                Estimated active rapid-acting
              </p>
              <p
                className="pt-1 text-2xl font-semibold tabular-nums"
                style={{ color: estimate.available ? ACCENT : MUTED }}
              >
                {estimate.available
                  ? estimate.isZero
                    ? "None active"
                    : `${estimate.value.toFixed(1)} u`
                  : "Unavailable"}
              </p>
              {!estimate.available && (
                <p className="pt-1 text-xs" style={{ color: MUTED }}>
                  {describeProjectionReason(estimate.reason)}
                </p>
              )}
              {basal && (
                <p className="mt-2 border-t pt-2 text-xs" style={{ borderColor: HAIRLINE, color: INK }}>
                  Basal active · {basal.label}
                  {basal.insulin_type ? ` (${basal.insulin_type})` : ""}
                </p>
              )}
            </div>

            {!available ? null : active.length === 0 ? (
              <p className="pt-4 text-sm" style={{ color: MUTED }}>
                Everything they have logged has finished acting for now.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 pt-5">
                  <Sparkles className="h-4 w-4 shrink-0" style={{ color: MUTED }} />
                  <span className="text-sm font-semibold" style={{ color: INK }}>
                    Active now
                  </span>
                </div>
                <p className="pt-0.5 text-[11px]" style={{ color: MUTED }}>
                  {rapid.length > 0
                    ? `${rapid.length} rapid-acting ${rapid.length === 1 ? "dose" : "doses"} still acting`
                    : "No rapid-acting dose is still acting"}
                  {basal ? " · basal included" : ""}.
                </p>
                <div className="divide-y" style={{ borderColor: HAIRLINE }}>
                  {active.map((dose) => (
                    <ActiveDoseRow key={`${dose.administered_at}-${dose.insulin_type}-${dose.units}`} dose={dose} />
                  ))}
                </div>
              </>
            )}

            <p className="pt-4 text-[11px] leading-relaxed" style={{ color: MUTED }}>
              These stages come from their logged doses and their own product timings. Just a clear picture to help you
              stay in the loop.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
}