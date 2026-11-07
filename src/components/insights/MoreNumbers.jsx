import { useState } from "react";
import { ChevronDown } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <span className="text-[12px]" style={{ color: "#6b6153" }}>
        {label}
      </span>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: "#3f3830" }}>
        {value}
      </span>
    </div>
  );
}

/**
 * The single disclosure at the foot of the view. Collapsed by default; the
 * expanded rows stay inline in the same reading flow.
 */
export default function MoreNumbers({ averageGlucose, gmi, hasEnough }) {
  const [open, setOpen] = useState(false);
  const gmiAvailable = hasEnough && Number.isFinite(gmi);

  return (
    <DashboardCard className="p-0">
      <h2 className="sr-only">More numbers</h2>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="insights-more-numbers"
        className="flex min-h-[52px] w-full items-center justify-between px-[18px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <span className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
          {open ? "Show less" : "More numbers"}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform"
          style={{ color: "#6b6153", transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div id="insights-more-numbers" className="px-[18px] pb-4">
          <Row
            label="Average glucose"
            value={`${formatGlucose(averageGlucose)} ${glucoseUnitLabel()}`}
          />
          <div className="h-px w-full" style={{ background: "#e6dccd" }} />
          <Row
            label="Glucose management indicator (GMI)"
            value={gmiAvailable ? `${gmi.toFixed(1)}%` : "Not enough data yet"}
          />
          <p className="text-[10px] leading-relaxed" style={{ color: "#746959" }}>
            An estimate from your glucose readings. Not a lab A1C result.
          </p>

          <div className="mt-3 border-t pt-3" style={{ borderColor: "#e6dccd" }}>
            <p className="text-[10px] leading-relaxed" style={{ color: "#746959" }}>
              Calculated from the readings available for this period.
            </p>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}