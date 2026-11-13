import { ArrowUp, ArrowUpRight, ArrowRight, ArrowDownRight, ArrowDown, ChevronsUp, ChevronsDown } from "lucide-react";
import { trendPresentation } from '@/lib/trendPresentation';

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
  const pair = trendPresentation(icon, { below: label === 'coming back up' });
  const Icon = pair ? TREND_ICONS[pair.icon] : null;
  if (!Icon) return null;
  label = pair.word;

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