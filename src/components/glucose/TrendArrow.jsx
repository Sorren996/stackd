import { ArrowUp, ArrowUpRight, ArrowRight, ArrowDownRight, ArrowDown, ChevronsUp, ChevronsDown, Minus } from "lucide-react";

/**
 * The one trend-arrow mapping.
 *
 * Both the patient's own glucose card and the follower's shared view import
 * this, so a direction can never be drawn with one set of arrows on one screen
 * and a different set on another.
 */
export const TREND_ICONS = {
  "double_up": ChevronsUp,
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
  "double_down": ChevronsDown,
};

/**
 * Draws a trend arrow.
 *
 * With no known direction it draws a neutral mark, never the steady arrow:
 * "we cannot tell" and "holding steady" are different statements, and the
 * steady arrow would make an unknown reading look like a measured one.
 */
export default function TrendArrow({ icon, className, style, size = 24, label = null }) {
  const Icon = icon ? TREND_ICONS[icon] : null;

  if (!Icon) {
    return (
      <Minus
        className={className}
        style={{ ...style, opacity: 0.55 }}
        size={size}
        strokeWidth={2.5}
        role="img"
        aria-label={label || "Direction not available"}
      />
    );
  }

  return (
    <Icon
      className={className}
      style={style}
      size={size}
      strokeWidth={2.5}
      aria-hidden={label ? undefined : "true"}
      aria-label={label || undefined}
      role={label ? "img" : undefined}
    />
  );
}