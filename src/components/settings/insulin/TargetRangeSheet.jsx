import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { isMmolMode, formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";

/**
 * Target range edit sheet. Recommended / Custom segmented control.
 * Custom shows a dual slider (70–250) inside the sheet. Cancel/Save footer.
 */
export default function TargetRangeSheet({ low, high, onSave, onCancel }) {
  const recommended = low === 70 && high === 180;
  const [mode, setMode] = useState(recommended ? "recommended" : "custom");
  const [draftLow, setDraftLow] = useState(low);
  const [draftHigh, setDraftHigh] = useState(high);
  const mmol = isMmolMode();

  const segmentStyle = (active) => ({
    flex: 1,
    padding: "10px 0",
    fontSize: "14px",
    fontWeight: 600,
    color: active ? "#fdf9f2" : "#6b6153",
    background: active ? "#9c5228" : "transparent",
    borderRadius: "999px",
    border: "none",
    transition: "color .15s, background .15s",
  });

  return (
    <div className="flex flex-col overflow-y-auto">
      <div className="px-6 pt-2 text-center">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
          Target range
        </h2>
      </div>

      {/* Segmented control */}
      <div className="mx-6 mt-6 flex rounded-full p-1" style={{ background: "#f7f1e8", border: "1px solid #eadccf" }}>
        <button type="button" onClick={() => setMode("recommended")} style={segmentStyle(mode === "recommended")}>
          Recommended
        </button>
        <button type="button" onClick={() => setMode("custom")} style={segmentStyle(mode === "custom")}>
          Custom
        </button>
      </div>

      <div className="px-6 pt-8">
        {mode === "custom" ? (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums" style={{ color: "#3f3830" }}>
                {formatGlucose(draftLow)}
              </span>
              <span className="text-xs" style={{ color: "#746959" }}>to</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: "#3f3830" }}>
                {formatGlucose(draftHigh)}
              </span>
            </div>
            <div className="pt-6">
              <Slider
                min={70}
                max={250}
                step={5}
                value={[draftLow, draftHigh]}
                onValueChange={(v) => {
                  setDraftLow(v[0]);
                  setDraftHigh(v[1]);
                }}
                className="cursor-pointer"
              />
            </div>
            <div className="flex justify-between pt-2 text-xs" style={{ color: "#5c554b" }}>
              <span>{formatGlucose(70)}</span>
              <span>{formatGlucose(250)}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <span className="text-2xl font-bold tabular-nums" style={{ color: "#3f3830" }}>
              {formatGlucose(70)}–{formatGlucose(180)} {glucoseUnitLabel()}
            </span>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
              The range most adults use for everyday glucose.
            </p>
          </div>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 px-6 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="py-3.5 text-sm font-medium transition active:opacity-60"
          style={{ color: "#9c5228" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSave(
              mode === "recommended" ? 70 : draftLow,
              mode === "recommended" ? 180 : draftHigh
            )
          }
          className="rounded-full px-8 py-3.5 text-sm font-semibold transition active:scale-[0.98]"
          style={{ background: "#9c5228", color: "#fdf9f2", boxShadow: "0 4px 16px rgba(156,82,40,0.28)" }}
        >
          Save
        </button>
      </div>
    </div>
  );
}