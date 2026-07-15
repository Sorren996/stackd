export default function HistoryStat({ label, value, unit }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-sm font-bold text-white">
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-medium text-white/40">{unit}</span>}
      </p>
    </div>
  );
}