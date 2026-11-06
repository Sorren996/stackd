import { useNavigate } from "react-router-dom";
import SectionCard from "@/components/editorial/SectionCard";
import { CATEGORY_LABEL, STATUS_COPY } from "@/lib/notifications/notificationCopy";

/** "2:15 PM" today, otherwise "Jun 1, 2:15 PM" — the time it happened. */
function whenLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: sameDay ? undefined : "short",
      day: sameDay ? undefined : "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return "";
  }
}

/**
 * The most recent notifications this account was sent.
 *
 * Deliberately sparse: the category, when the reading happened, whether the
 * preview showed details, and whether the entry has been opened. No values are
 * shown or stored here, and "submitted" never becomes "delivered".
 */
export default function RecentNotifications({ recent, onOpen, openingId }) {
  const navigate = useNavigate();
  const rows = Array.isArray(recent) ? recent : [];

  return (
    <SectionCard label="Recent notifications">
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "#6b6153" }}>
          Nothing yet. When something is sent, it appears here.
        </p>
      ) : (
        <div className="divide-y" style={{ borderColor: "#eadccf" }}>
          {rows.map((row) => {
            const unread = !row.read_at;
            return (
              <button
                key={row.id}
                type="button"
                disabled={openingId === row.id}
                onClick={() => onOpen(row)}
                className="flex w-full items-start gap-2.5 py-2.5 text-left transition active:opacity-60"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: unread ? "#9c5228" : "transparent" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium" style={{ color: "#3f3830" }}>
                    {CATEGORY_LABEL[row.category] || "Stackd update"}
                    {row.audience === "follower" && row.person_name ? ` · ${row.person_name}` : ""}
                  </span>
                  <span className="block text-xs tabular-nums" style={{ color: "#746959" }}>
                    {whenLabel(row.occurred_at)}
                    {` · ${STATUS_COPY[row.status] || "Submitted"}`}
                    {unread ? "" : " · opened"}
                  </span>
                </span>
                <span className="shrink-0 pt-1 text-sm" style={{ color: "#746959" }}>
                  ›
                </span>
              </button>
            );
          })}
        </div>
      )}

      <p className="pt-3 text-xs leading-relaxed" style={{ color: "#746959" }}>
        Opening an entry only marks it as read.{" "}
        <span className="font-serif-italic" style={{ color: "#3f3830" }}>
          It does not mean anything was resolved.
        </span>
      </p>
      <button
        type="button"
        className="pt-2 text-xs font-semibold underline"
        style={{ color: "#9c5228" }}
        onClick={() => navigate("/")}
      >
        Go to your day
      </button>
    </SectionCard>
  );
}