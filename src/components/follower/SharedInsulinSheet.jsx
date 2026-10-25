import Sheet from "@/components/Sheet";
import { describeProjectionReason } from "@/lib/sharing/sharingCopy";

/**
 * The followed person's recent doses, read-only.
 *
 * A plain list of what they logged. No calculator, no advice, and no figure
 * derived from the viewer's own absent settings.
 */
export default function SharedInsulinSheet({ open, onClose, insulin, reason, sharerLabel }) {
  if (!insulin) {
    return (
      <Sheet open={open} onClose={onClose}>
        <div className="flex-1 overflow-y-auto px-6 pb-8">
          <h2 className="pb-2 text-lg font-semibold" style={{ color: "#3f3830" }}>
            Recent doses
          </h2>
          <p className="text-sm" style={{ color: "#746959" }}>
            {describeProjectionReason(reason)}
          </p>
        </div>
      </Sheet>
    );
  }

  const doses = Array.isArray(insulin.doses) ? [...insulin.doses].reverse() : [];

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        <h2 className="pb-1 text-lg font-semibold" style={{ color: "#3f3830" }}>
          Recent doses
        </h2>
        <p className="pb-5 text-sm" style={{ color: "#746959" }}>
          What {sharerLabel} logged in the last {insulin.window_hours} hours. This is a record, not advice.
        </p>

        {doses.length === 0 ? (
          <p className="text-sm" style={{ color: "#746959" }}>
            No doses were logged in this window.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#eadccf" }}>
            {doses.map((dose, index) => (
              <div key={`${dose.administered_at}-${index}`} className="flex items-baseline justify-between gap-3 py-3">
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "#3f3830" }}>
                  {dose.insulin_type || "Insulin"}
                </span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: "#746959" }}>
                  {dose.administered_at
                    ? new Date(dose.administered_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums" style={{ color: "#3f3830" }}>
                  {Number.isFinite(Number(dose.units)) ? `${Number(dose.units)} u` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}

        {!insulin.dose_math_available && (
          <p className="pt-4 text-xs" style={{ color: "#746959" }}>
            Their insulin plan has not been confirmed in Stackd, so no active-insulin figure can be worked out yet.
          </p>
        )}
      </div>
    </Sheet>
  );
}