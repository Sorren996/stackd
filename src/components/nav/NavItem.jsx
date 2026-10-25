import { Link } from "react-router-dom";

/**
 * One destination in the bar. The selected item keeps the bar's existing
 * treatment: clay icon and label plus a small clay underline.
 */
export default function NavItem({ item, active, onPress }) {
  const { Icon, label, path } = item;
  const ink = active ? "var(--nav-accent)" : "var(--nav-label)";

  return (
    <Link
      to={path}
      onClick={onPress}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="flex min-w-0 flex-1 flex-col items-center gap-[3px]"
      style={{ color: ink }}
    >
      <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2.3 : 1.7} aria-hidden="true" />
      <span
        className="w-full truncate text-center text-[10px] font-semibold uppercase leading-none"
        style={{ letterSpacing: "0.06em", color: ink }}
      >
        {label}
      </span>
      {/* Always rendered so nothing shifts when the selection moves. */}
      <span
        aria-hidden="true"
        className="rounded-full"
        style={{ width: 16, height: 2, background: "var(--nav-accent)", opacity: active ? 1 : 0 }}
      />
    </Link>
  );
}