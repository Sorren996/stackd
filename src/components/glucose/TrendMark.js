// The dashboard's trend arrow, as one guarded decision.
//
// resolveGlucoseTrend answers null when neither the sensor's own reported arrow
// nor the stored readings support a direction — no readings yet, a single
// reading, a sensor arrow we do not recognise. "We cannot tell" is not the same
// statement as "holding steady", so the mark is omitted entirely instead of
// being drawn as a flat arrow, and a missing direction can never reach an icon
// lookup. That lookup is what took the whole dashboard down for anyone with no
// reading to show yet.
import { createElement } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowRight,
  ArrowDownRight,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
} from "lucide-react";

export const TREND_ICON_MAP = {
  double_up: ChevronsUp,
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
  double_down: ChevronsDown,
};

// The arrow for a resolved trend, or null when there is no direction to draw.
// A key that is not one of our own seven arrows is treated as no direction.
export function trendIconFor(trend) {
  const key = trend && typeof trend.icon === "string" ? trend.icon : null;
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(TREND_ICON_MAP, key) ? TREND_ICON_MAP[key] : null;
}

export default function TrendMark({ trend = null, size = 30, strokeWidth = 2.5, className, style }) {
  const Icon = trendIconFor(trend);
  if (!Icon) return null;
  return createElement(Icon, {
    size,
    strokeWidth,
    className,
    style,
    role: "img",
    "aria-label": trend?.label || "Glucose trend",
  });
}