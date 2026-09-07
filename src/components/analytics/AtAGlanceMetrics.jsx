const DIVIDER_STYLE = {
  background: "linear-gradient(to right, transparent, rgba(255,255,255,0.05), transparent)",
};

function MetricItem({ label, value, unit, comparison, isQuiet }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-baseline justify-between py-2">
      <span className={`text-[11px] ${isQuiet ? "text-white/25" : "text-white/35"}`}>{label}</span>
      <div className="flex flex-col items-end gap-0">
        <span className={`font-bold tracking-tight text-white ${isQuiet ? "text-[13px]" : "text-[14px]"}`}>
          {value}
          {unit && <span className="ml-1 text-[10px] font-medium text-white/35">{unit}</span>}
        </span>
        {comparison && (
          <span className="text-[9px] font-medium" style={{ color: comparison.color }}>
            {comparison.text}
          </span>
        )}
      </div>
    </div>
  );
}

export default function AtAGlanceMetrics({ averageGlucose, gmi, targetLow, targetHigh, comparisons, rangeDays }) {
  return (
    <div>
      <MetricItem
        label="Average glucose"
        value={Number.isFinite(averageGlucose) ? Math.round(averageGlucose) : null}
        unit="mg/dL"
        comparison={comparisons?.averageGlucose}
      />
      <div className="h-px w-full" style={DIVIDER_STYLE} />
      <MetricItem
        label="GMI"
        value={Number.isFinite(gmi) ? gmi.toFixed(1) : null}
        unit="%"
        comparison={comparisons?.gmi}
      />
      <div className="h-px w-full" style={DIVIDER_STYLE} />
      <MetricItem
        label="Target range"
        value={`${targetLow}\u2013${targetHigh}`}
        unit="mg/dL"
        isQuiet
      />
    </div>
  );
}