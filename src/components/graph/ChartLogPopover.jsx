import { format } from "date-fns";
import InfoPopover from "@/components/graph/InfoPopover";
import { getInsulinProfile, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { formatRemaining } from "@/lib/remainingInsulin";
import { basalStatusLine } from "@/lib/basalStatusLine";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";

const FINISHED_DOSE_DOT = "#b8aea0";
const GLUCOSE_RUST = "#8C4A28";
const HAIRLINE = "rgba(46,36,32,.14)";

export function formatLoggedUnits(dose) {
  const direct = Number(dose?.units);
  const raw =
    Number.isFinite(direct) && direct > 0
      ? direct
      : Math.max(0, Number(dose?.meal_units) || 0) + Math.max(0, Number(dose?.correction_units) || 0);
  if (!Number.isFinite(raw)) return "0";
  return String(Number(raw.toFixed(2)));
}

function formatLoggedCarbs(entry) {
  const n = Number(entry?.carbs);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(1)));
}

export function formatPopoverTimeLine(rawTime, nowMs = Date.now()) {
  const ts = typeof rawTime === "number" ? rawTime : new Date(rawTime).getTime();
  if (!Number.isFinite(ts)) return "";
  const date = new Date(ts);
  const now = new Date(nowMs);
  const clock = format(date, "h:mm a");
  const diffMin = Math.floor(Math.max(0, nowMs - ts) / 60000);

  if (diffMin < 1) return `Just now · ${clock}`;
  if (diffMin < 60) return `${diffMin} min ago · ${clock}`;

  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `${Math.max(1, Math.floor(diffMin / 60))} h ago · ${clock}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    return `Yesterday · ${clock}`;
  }

  const dateLabel =
    date.getFullYear() === now.getFullYear()
      ? format(date, "MMM d")
      : format(date, "MMM d, yyyy");
  return `${dateLabel} · ${clock}`;
}

function findActiveDoseEntry(dose, activeInsulinBreakdown) {
  if (!dose || !Array.isArray(activeInsulinBreakdown)) return null;
  if (dose.id != null) {
    const byId = activeInsulinBreakdown.find((entry) => entry.id === dose.id);
    if (byId) return byId;
  }
  const doseTime = new Date(
    dose.administered_at || dose.administeredAt || dose.created_at || dose.created_date
  ).getTime();
  return (
    activeInsulinBreakdown.find(
      (entry) => entry.type === dose.insulin_type && Number.isFinite(doseTime) && entry.time === doseTime
    ) || null
  );
}

export default function ChartLogPopover({
  activeMarker,
  activeInsulinBreakdown,
  glucoseReadOnly = false,
  confirmDelete = false,
  onConfirmDeleteChange,
  onEdit,
  onDelete,
  onClose,
}) {
  if (!activeMarker) return null;
  const { type, item, rect } = activeMarker;
  const nowMs = Date.now();

  const isSensorReading =
    type === "glucose" && (item?.source === "dexcom" || item?.source === "dexcom_share");
  const showActions =
    Boolean(onEdit || onDelete) && !(type === "glucose" && (isSensorReading || glucoseReadOnly));

  let eyebrowText = "";
  let markerNode = null;
  let valueText = "";
  let valueColor = "#2e2420";
  let unitText = "";
  let sentenceNode = null;
  let rawTime = null;

  if (type === "insulin") {
    const profile = getInsulinProfile(item?.insulin_type);
    const activeEntry = findActiveDoseEntry(item, activeInsulinBreakdown);
    const isActive = Boolean(activeEntry);
    const dotColor = isActive
      ? profile?.color || activeEntry?.color || "#5b6550"
      : FINISHED_DOSE_DOT;

    eyebrowText = profile?.display_name || item?.insulin_type || "Insulin";
    markerNode = (
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: dotColor,
          flexShrink: 0,
        }}
      />
    );
    valueText = formatLoggedUnits(item);
    unitText = "units";
    rawTime = item?.administered_at || item?.created_at || item?.created_date;

    if (!isActive) {
      sentenceNode = <span>Finished dose</span>;
    } else if (isBasalInsulinType(activeEntry.type || item?.insulin_type)) {
      sentenceNode = <span>{basalStatusLine(activeEntry, nowMs).label}</span>;
    } else {
      const formattedRemaining = formatRemaining(activeEntry.iob);
      const isUnderOneUnit = activeEntry.iob > 0 && activeEntry.iob < 1;
      sentenceNode = (
        <span className="inline-flex items-baseline gap-1.5">
          <span>{formattedRemaining} active now</span>
          {isUnderOneUnit && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#8F7E6B",
              }}
            >
              ESTIMATED
            </span>
          )}
        </span>
      );
    }
  } else if (type === "carbs") {
    eyebrowText = "MEAL";
    markerNode = (
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          boxSizing: "border-box",
          borderRadius: 999,
          border: "1.5px solid #3f3830",
          background: "#FDF9F2",
          flexShrink: 0,
        }}
      />
    );
    valueText = formatLoggedCarbs(item);
    unitText = "g carbs";
    sentenceNode = (
      <span className="block truncate">{item?.food_name || item?.name || "Food"}</span>
    );
    rawTime = item?.consumed_at || item?.recorded_at || item?.created_date || item?.created_at;
  } else if (type === "glucose") {
    eyebrowText = "GLUCOSE";
    markerNode = (
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: GLUCOSE_RUST,
          flexShrink: 0,
        }}
      />
    );
    valueText = formatGlucose(item?.value);
    valueColor = GLUCOSE_RUST;
    unitText = glucoseUnitLabel();
    sentenceNode = <span>{isSensorReading ? "From your sensor" : "Entered by you"}</span>;
    rawTime = item?.recorded_at || item?.created_at || item?.created_date;
  }

  const timeLine = formatPopoverTimeLine(rawTime, nowMs);

  return (
    <InfoPopover anchorRect={rect} onClose={onClose} editorial>
      {/* 1. Eyebrow + 8px marker + hairline rule */}
      <div
        className="flex items-center gap-1.5"
        style={{
          paddingBottom: 9,
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        {markerNode}
        <span
          className="truncate"
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.16em",
            lineHeight: 1.2,
            color: "#8F7E6B",
          }}
        >
          {eyebrowText}
        </span>
      </div>

      {/* 2. Value + unit */}
      <div className="flex items-baseline gap-1.5" style={{ marginTop: 10 }}>
        <span
          style={{
            fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
            fontWeight: 400,
            fontSize: 42,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
            color: valueColor,
          }}
        >
          {valueText}
        </span>
        <span style={{ fontSize: 12, lineHeight: 1, color: "#8F7E6B" }}>{unitText}</span>
      </div>

      {/* 3. One sentence line */}
      <div
        className="min-w-0"
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: 1.35,
          color: "#5B5046",
        }}
      >
        {sentenceNode}
      </div>

      {/* 4. Time line */}
      {timeLine && (
        <p
          style={{
            marginTop: 4,
            fontSize: 11,
            lineHeight: 1.35,
            color: "#8F7E6B",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeLine}
        </p>
      )}

      {/* 5. Actions */}
      {showActions && (
        <div className="flex items-center gap-3.5" style={{ marginTop: 12 }}>
          {!confirmDelete ? (
            <>
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="transition hover:opacity-75 active:opacity-60"
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(46,36,32,.2)",
                    background: "transparent",
                    padding: "8px 20px",
                    fontSize: 12,
                    fontWeight: 600,
                    lineHeight: 1.2,
                    color: "#2e2420",
                  }}
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onConfirmDeleteChange?.(true)}
                  className="transition hover:opacity-75 active:opacity-60"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: "8px 6px",
                    fontSize: 12,
                    fontWeight: 500,
                    lineHeight: 1.2,
                    color: "#9c3f2e",
                  }}
                >
                  Remove
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onConfirmDeleteChange?.(false)}
                className="whitespace-nowrap transition hover:opacity-75 active:opacity-60"
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(46,36,32,.2)",
                  background: "transparent",
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  lineHeight: 1.2,
                  color: "#2e2420",
                }}
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="whitespace-nowrap transition hover:opacity-75 active:opacity-60"
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "8px 4px",
                  fontSize: 12,
                  fontWeight: 500,
                  lineHeight: 1.2,
                  color: "#9c3f2e",
                }}
              >
                Confirm remove
              </button>
            </>
          )}
        </div>
      )}
    </InfoPopover>
  );
}