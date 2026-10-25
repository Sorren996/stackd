import { computeSharedDailyBalance } from "@/lib/sharing/sharedDailyBalance";
import { describeDirection, describeProjectionReason, describeReadingAge, describeZone } from "@/lib/sharing/sharingCopy";

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
  const direction = glucose.stale ? null : describeDirection(glucose.direction);
  const zone = describeZone(glucose.zone);

  const zoneColor =
    glucose.zone === "urgentLow" || glucose.zone === "below"
      ? "#a2564a"
      : glucose.zone === "above"
        ? "#9a6f2f"
        : "#5b6550";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: "#3f3830" }}>
          {latest ? Math.round(latest.value) : "—"}
        </span>
        <span className="text-xs" style={{ color: "#746959" }}>
          mg/dL
        </span>
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
        {direction && ` · ${direction}`}
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