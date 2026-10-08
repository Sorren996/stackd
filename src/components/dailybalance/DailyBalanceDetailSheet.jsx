import Sheet from "@/components/Sheet";
import BalanceSpectrum from "./BalanceSpectrum";
import { getDailyBalanceState, describeDayShape } from "@/lib/dailyBalanceState";

const PALETTE = {
  ink: "#3f3830",
  sec: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  canvas: "#f7f1e8",
  // Soft, muted earthy tones that match the BalanceSpectrum gradient —
  // lighter than the WCAG text tokens so the bar reads as a calm summary,
  // not a danger indicator.
  inRange: "#8a9789",   // muted sage — matches the spectrum's right (steady) end
  above: "#c69a78",     // warm clay  — matches the spectrum's left end
  below: "#b87f6a",     // muted clay-red for time below range
};

function formatDate() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// Derives the in/above/below percentages from the SAME already-computed minute
// breakdown used on the home card, so the detail view can never disagree with
// the headline. in-range % mirrors the authoritative Daily Balance number;
// above/below are the same point-count proportions expressed as percentages.
function derivePercents(breakdown, percentage) {
  if (!breakdown) return null;
  const totalMin =
    (breakdown.inRangeMin || 0) + (breakdown.aboveMin || 0) + (breakdown.belowMin || 0);
  if (!totalMin) return null;
  const inRange = Math.round(percentage || 0);
  const above = Math.round(((breakdown.aboveMin || 0) / totalMin) * 100);
  const below = Math.round(((breakdown.belowMin || 0) / totalMin) * 100);
  return { inRange, above, below };
}

export default function DailyBalanceDetailSheet({
  open,
  onClose,
  percentage,
  breakdown,
  readings,
  targetLow,
  targetHigh,
}) {
  const state = getDailyBalanceState(percentage);
  const hasData = percentage != null && Number.isFinite(percentage);
  const displayValue = hasData ? `${Math.floor(percentage)}%` : "--";
  const percents = derivePercents(breakdown, percentage);
  const shape = hasData ? describeDayShape(readings, targetLow, targetHigh) : [];

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex flex-col overflow-y-auto px-1">
        {/* Header */}
        <div className="px-6 pb-2">
          <div className="section-label">Daily Balance</div>
          <p className="mt-1 text-xs" style={{ color: PALETTE.faint }}>
            {formatDate()}
          </p>
        </div>

        {/* Hero: percentage + state */}
        <div className="px-6 pt-2">
          <div className="flex items-baseline gap-2">
            <span className="anchor-number" style={{ color: PALETTE.ink }}>
              {displayValue}
            </span>
            {hasData && (
              <span className="text-sm font-medium" style={{ color: PALETTE.sec }}>
                {state.label}
              </span>
            )}
          </div>
          {hasData && (
            <div className="mt-3">
              <BalanceSpectrum percentage={percentage} markerSize={20} trackHeight={9} />
            </div>
          )}
        </div>

        {/* Where the day went */}
        {percents && (
          <div className="px-6 pt-6">
            <div className="section-label">Where the day went</div>
            <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full"
              style={{ background: PALETTE.canvas }}>
              <div style={{ width: `${percents.inRange}%`, background: PALETTE.inRange }} />
              <div style={{ width: `${percents.above}%`, background: PALETTE.above }} />
              <div style={{ width: `${percents.below}%`, background: PALETTE.below }} />
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-baseline">
                <span className="flex items-center gap-2 text-xs" style={{ color: PALETTE.sec }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.inRange }} />
                  In range
                </span>
                <span className="mx-2 flex-1 dotted-leader" />
                <span className="text-xs font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                  {percents.inRange}% · {breakdown.inRange}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="flex items-center gap-2 text-xs" style={{ color: PALETTE.sec }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.above }} />
                  Above
                </span>
                <span className="mx-2 flex-1 dotted-leader" />
                <span className="text-xs font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                  {percents.above}% · {breakdown.above}
                </span>
              </div>
              <div className="flex items-baseline">
                <span className="flex items-center gap-2 text-xs" style={{ color: PALETTE.sec }}>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PALETTE.below }} />
                  Below
                </span>
                <span className="mx-2 flex-1 dotted-leader" />
                <span className="text-xs font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                  {percents.below}% · {breakdown.below}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* What shaped today */}
        <div className="px-6 pt-6">
          <div className="section-label">What shaped today</div>
          <div className="mt-3 space-y-2">
            {shape.length > 0 ? (
              shape.map((item) => (
                <div key={item.label} className="flex items-baseline">
                  <span className="text-xs font-medium" style={{ color: PALETTE.ink }}>
                    {item.label}
                  </span>
                  <span className="mx-2 flex-1 dotted-leader" />
                  <span className="text-xs" style={{ color: PALETTE.sec }}>
                    {item.description}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs leading-relaxed" style={{ color: PALETTE.faint }}>
                Still gathering today's picture — check back as more readings arrive.
              </p>
            )}
          </div>
          <p className="mt-4 text-[10px] leading-relaxed" style={{ color: PALETTE.faint }}>
            An observation of where the day spent time, not a judgment of it.
          </p>
        </div>

        <div className="h-4" />
      </div>
    </Sheet>
  );
}