import TrendArrow from "@/components/glucose/TrendArrow";
import { resolveGlucoseTrend } from "@/lib/glucoseTrend";
import { computeSharedDailyBalance } from "@/lib/sharing/sharedDailyBalance";
import { describeProjectionReason, describeReadingAge, describeZone } from "@/lib/sharing/sharingCopy";

/**
 * The follower's glucose panel.
 *
 * Every number here comes from the server projection — the 24 hour window, the
 * day boundary and the target range are all the SHARER's. The daily balance is
 * computed with the same helper the patient's own dashboard uses, so the two
 * always read the same figure.
 */
export default function SharedGlucosePanel({ glucose, reason }) {
  if (!glucose) {
    return (
      <p className="text-sm" style={{ color: "#746959" }}>
        {describeProjectionReason(reason)}
      </p>
    );
  }

  const latest = glucose.latest;
  const balance = computeSharedDailyBalance(
    glucose.readings,
    glucose.target_low,
    glucose.target_high,
    glucose.today_start
  );
  // One computation drives BOTH the arrow and the written direction, so the two
  // can never contradict each other. It is the same least-squares mapping the
  // patient's own hero uses, over the same readings, and it is only drawn at all
  // when the projection itself describes a direction — a stale reading makes no
  // claim in either form, and neither does a window with too few readings to
  // derive one from. "We cannot tell" is drawn as a neutral mark, never as the
  // steady arrow.
  const realReadings = Array.isArray(glucose.readings) ? glucose.readings : [];
  // The CGM's own reported arrow is preferred where the source supplies one,
  // exactly as the patient's own hero does; otherwise the rate is derived from
  // the readings with the same mapping. Below two readings nothing is derived,
  // so no steady arrow is ever implied from thin data.
  const trend =
    !glucose.stale && glucose.direction != null
      ? resolveGlucoseTrend(latest, realReadings)
      : null;
  const zone = describeZone(glucose.zone);

  const zoneColor =
    glucose.zone === "urgentLow" || glucose.zone === "below"
      ? "#a2564a"
      : glucose.zone === "above"
        ? "#9a6f2f"
        : "#5f8460";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] tabular-nums" style={{ color: "#3a2f28", fontWeight: 300, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
          {latest ? Math.round(latest.value) : "—"}
        </span>
        <span className="text-xs font-normal" style={{ color: "#7a6b5d" }}>
          mg/dL
        </span>
        {/* The direction is written out below, so the arrow itself is
            decorative when one exists; with no direction it announces that
            instead of staying silent. */}
        <TrendArrow icon={trend?.icon} className="self-center" size={20} style={{ color: "#3f3830" }} />
        {!glucose.stale && zone && (
          <span
            className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ background: `${zoneColor}1f`, color: zoneColor }}
          >
            {zone}
          </span>
        )}
      </div>

      <p className="text-xs" style={{ color: "#746959" }}>
        {describeReadingAge(glucose.latest_age_minutes)}
        {glucose.stale && " · the newest reading is older than usual"}
        {trend?.label && ` · ${trend.label}`}
      </p>

      {glucose.stale && (
        <p className="text-xs" style={{ color: "#9a6f2f" }}>
          Showing the last reading they shared. A current direction is not described while the data is this old.
        </p>
      )}

      <div className="flex items-baseline justify-between border-t pt-2" style={{ borderColor: "#eadccf" }}>
        <span className="text-sm" style={{ color: "#3f3830" }}>
          Today&apos;s balance
        </span>
        <span className="text-sm font-medium" style={{ color: "#3f3830" }}>
          {balance ? `${balance.label} · ${balance.percent}%` : "Not enough data yet"}
        </span>
      </div>

      {latest?.source === "system" && (
        <p className="text-xs" style={{ color: "#746959" }}>
          The newest reading was filled in by the app rather than measured.
        </p>
      )}
    </div>
  );
}