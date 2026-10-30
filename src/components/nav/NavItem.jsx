import { Link } from "react-router-dom";
import NavLabel from "@/components/nav/NavLabel";

/**
 * One destination. Each item fills its own grid slot, so the four page items are
 * spaced identically by the bar's shared grid rather than by per-item offsets.
 *
 * The whole slot is the touch target (>=44px in both axes). The icon, label and
 * underline are always rendered in the same order with the same gaps, so every
 * item shares one label baseline and one underline position.
 *
 * Active state is carried by colour plus a short, straight underline — no pill,
 * bubble or filled container behind the item.
 */
export default function NavItem({ item, active, onPress }) {
  const { Icon, label, path } = item;
  const iconColor = active ? "var(--nav-active)" : "var(--nav-icon)";
  const labelColor = active ? "var(--nav-active)" : "var(--nav-label)";

  return (
    <Link
      to={path}
      onClick={onPress}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="flex h-full min-w-0 flex-col items-center justify-end gap-[3px]"
    >
      <Icon
        className="h-[22px] w-[22px] shrink-0"
        strokeWidth={active ? 2.2 : 1.7}
        style={{ color: iconColor }}
        aria-hidden="true"
      />
      <NavLabel color={labelColor}>{label}</NavLabel>
      {/* Always rendered so the shared baseline never shifts. Straight-edged:
          an underline, not a rounded pill. */}
      <span
        aria-hidden="true"
        style={{ width: 20, height: 2, background: "var(--nav-active)", opacity: active ? 1 : 0 }}
      />
    </Link>
  );
}