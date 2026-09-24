import { Link } from "react-router-dom";

/**
 * Ledger row: 14px #3f3830 text, dotted leader line (#d8cec2) filling the
 * middle, value on the right in #8a7f70, chevron "›" for tappable rows.
 * Timestamps in #a89e8d on the left (optional `timestamp` prop).
 *
 * Pass `to` for a navigable row (renders chevron), or `onClick` for an action.
 */
export default function LedgerRow({ label, value, timestamp, to, onClick, danger = false, actionLabel }) {
  const content = (
    <div className="flex items-baseline gap-2 py-2.5">
      {timestamp && (
        <span className="shrink-0 text-xs" style={{ color: "#746959" }}>
          {timestamp}
        </span>
      )}
      <span
        className="shrink-0 text-sm font-medium"
        style={{ color: danger ? "#c97060" : "#3f3830" }}
      >
        {label}
      </span>
      <span className="flex-1 overflow-hidden">
        <span className="dotted-leader block" />
      </span>
      {value && (
        <span className="shrink-0 text-sm" style={{ color: danger ? "#c97060" : "#6b6153" }}>
          {value}
        </span>
      )}
      {actionLabel ? (
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wider" style={{ color: danger ? "#c97060" : "#746959" }}>
          {actionLabel}
        </span>
      ) : (to || onClick) && (
        <span className="shrink-0 text-sm" style={{ color: "#746959" }}>
          ›
        </span>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block transition hover:opacity-70 active:opacity-50">
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left transition hover:opacity-70 active:opacity-50">
        {content}
      </button>
    );
  }
  return content;
}