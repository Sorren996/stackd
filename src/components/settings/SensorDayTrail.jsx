import { Fragment } from "react";

const COLOR_FRESH = "#5ba88a";
const COLOR_NEAR = "#d9a938";
const MINT = "#A2F4DD";

// Waxing Dots — a horizontal trail of day-dots connected by hairlines.
// Past days fill solid, the current day is a half-lit "waxing" dot with a
// soft mint halo, and future days rest as quiet hollow rings.
//
// The dot state is derived from the DISPLAYED remaining whole days (the same
// number the countdown text shows), so the trail never disagrees with the
// "Xd Yh left" label — e.g. 1 day left on a 15-day sensor always shows 14
// filled dots with the final day waxing.
export default function SensorDayTrail({ totalDays, remainingDays, expired }) {
  const total = Math.max(1, totalDays || 10);
  const rDays = Math.max(0, remainingDays || 0);

  // 0-based index of the day currently being lived through. With at least
  // one full day left it's the day we're in; in the final <24h it's the last
  // day. Expired → all days complete (currentIndex = total → every dot past).
  const currentIndex = expired
    ? total
    : Math.min(total - Math.max(rDays, 1), total - 1);

  const nearExpiry = !expired && rDays === 0;
  const color = expired || nearExpiry ? COLOR_NEAR : COLOR_FRESH;
  const dayNumber = expired ? total : Math.min(currentIndex + 1, total);

  return (
    <div>
      <div className="flex items-center">
        {Array.from({ length: total }, (_, i) => {
          const isPast = i < currentIndex;
          const isCurrent = !expired && i === currentIndex;
          const isFuture = i > currentIndex;
          return (
            <Fragment key={i}>
              <div className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                {isCurrent && (
                  <span
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{ background: `radial-gradient(circle, ${MINT}66, transparent 70%)` }}
                  />
                )}
                {isPast && (
                  <span
                    className="block rounded-full"
                    style={{ width: 10, height: 10, background: color, boxShadow: `0 0 5px ${color}80` }}
                  />
                )}
                {isCurrent && (
                  <span
                    className="relative block rounded-full"
                    style={{
                      width: 10,
                      height: 10,
                      background: `linear-gradient(90deg, ${color} 50%, transparent 50%)`,
                      border: `1px solid ${color}`,
                      boxShadow: `0 0 6px ${MINT}80`,
                    }}
                  />
                )}
                {isFuture && (
                  <span
                    className="block rounded-full"
                    style={{ width: 6, height: 6, border: `1px solid rgba(255,255,255,0.18)` }}
                  />
                )}
              </div>
              {i < total - 1 && (
                <span
                  className="h-px flex-1"
                  style={{ background: isPast ? `${color}55` : "rgba(255,255,255,0.08)" }}
                />
              )}
            </Fragment>
          );
        })}
      </div>
      <p className="mt-1.5 text-center text-[10px] font-medium text-white/40">
        Day {dayNumber} of {total}
      </p>
    </div>
  );
}