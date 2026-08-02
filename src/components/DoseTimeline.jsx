import { formatMinutes } from "@/lib/insulinPharmacology";

function DoseTimelineBar({ dose }) {
  const { shortName, units, iob, color, statusLabel, timingInfo } = dose;
  const progress = timingInfo?.progress ?? 0;
  const remainingMin = timingInfo?.remainingMin ?? 0;
  const isSettling = remainingMin <= 1;

  return (
    <div className="rounded-xl border border-white/45 bg-white/30 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <p className="truncate text-xs font-semibold text-emerald-950">{shortName}</p>
          <span className="text-[10px] text-emerald-800">{units}u</span>
        </div>
        <span className="shrink-0 text-sm font-bold text-emerald-950">{Math.round(iob)}u</span>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.35)" }}>
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${color}15, ${color}30)` }}
        />
        <div
          className="absolute inset-y-0"
          style={{ left: `${progress * 100}%`, right: 0, background: `linear-gradient(90deg, ${color}90, ${color}40)` }}
        />
        <div
          className="absolute h-3.5 w-0.5 rounded-full bg-white/80"
          style={{ left: `${progress * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-[10px] text-emerald-800">{statusLabel}</p>
        <p className="text-[10px] font-medium" style={{ color: isSettling ? "rgba(6,78,59,0.6)" : color, textShadow: "0 2px 10px rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.14)" }}>
          {isSettling ? "Gently settling" : `Estimated ~${formatMinutes(remainingMin)} left`}
        </p>
      </div>
    </div>
  );
}

export default function DoseTimeline({ doses }) {
  if (!doses?.length) return null;
  return (
    <div className="space-y-2">
      {doses.map((dose) => (
        <DoseTimelineBar key={dose.id} dose={dose} />
      ))}
    </div>
  );
}