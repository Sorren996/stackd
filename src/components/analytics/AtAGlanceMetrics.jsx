const DIVIDER_STYLE = {
  background: "linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)",
};

function MetricItem({ label, value, unit, comparison }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-baseline justify-between py-4">
      <span className="text-[11px] uppercase tracking-[0.12em] text-white/30">{label}</span>
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-xl font-bold tracking-tight text-white">
          {value}
          {unit && <span className="ml-1 text-xs font-medium text-white/35">{unit}</span>}
        </span>
        {comparison && (
          <span className="text-[10px] font-medium" style={{ color: comparison.color }}>
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
      />
    </div>
  );
}