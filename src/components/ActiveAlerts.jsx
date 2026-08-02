import { getDoseStatus, formatMinutes, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Clock, TrendingUp, TrendingDown, CheckCircle2, Zap } from "lucide-react";

const phaseConfig = {
  waiting: { icon: Clock, color: "#a8b89a", label: "Beginning" },
  rising: { icon: TrendingUp, color: "#6b92c4", label: "Building" },
  active: { icon: Zap, color: "#5ba88a", label: "Supporting" },
  declining: { icon: TrendingDown, color: "#9a8fc7", label: "Easing" },
  expired: { icon: CheckCircle2, color: "#8b8b97", label: "Complete" },
};

export default function ActiveAlerts({ doses = [] }) {
  
  const activeDoses = doses
    .map((dose) => ({ dose, status: getDoseStatus(dose) }))
    .filter(({ status }) => status.phase !== "expired")
    .sort((left, right) => {
      const order = { rising: 0, active: 0, waiting: 1, declining: 2 };
      return (order[left.status.phase] ?? 3) - (order[right.status.phase] ?? 3);
    });

  if (!activeDoses.length) return null;

  return (
    <section className="active-alerts w-full space-y-3 overflow-hidden">
      <h2 className="text-soft-shadow active-alerts-title px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-950">
        Active Support
      </h2>

      <div className="space-y-2 bg-transparent">
        {activeDoses.map(({ dose, status }) => {
          const config = phaseConfig[status.phase] || phaseConfig.expired;
          const Icon = config.icon;
          const profile = INSULIN_PROFILES[dose.insulin_type];

          return (
            <div key={dose.id} className="active-alert-row flex items-center gap-3 rounded-2xl border border-white/45 p-3 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.22)" }}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${config.color}40`, background: `${config.color}18` }}>
                <Icon className="h-4 w-4" style={{ color: config.color, filter: "drop-shadow(0 1px 2px rgba(255,255,255,0.5))" }} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-transparent" style={{ backgroundColor: profile?.color || "#35a879" }} />
                  <p className="truncate text-sm font-semibold text-emerald-950">
                    {dose.insulin_type} - {dose.units}u
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-emerald-800">{status.message}</p>
                {status.minutesUntil !== undefined && (
                  <p className="mt-1 text-xs font-semibold text-emerald-900">
                    {formatMinutes(status.minutesUntil)} left
                  </p>
                )}
              </div>

              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: config.color, textShadow: "0 2px 10px rgba(255,255,255,0.55), 0 1px 3px rgba(0,0,0,0.14)" }}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}