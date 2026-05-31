import { getDoseStatus, formatMinutes, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Clock, TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, Zap } from "lucide-react";

const phaseConfig = {
  waiting: { icon: Clock, className: "text-amber-600 bg-amber-50 border-amber-200" },
  rising: { icon: TrendingUp, className: "text-blue-600 bg-blue-50 border-blue-200" },
  active: { icon: Zap, className: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  declining: { icon: TrendingDown, className: "text-violet-600 bg-violet-50 border-violet-200" },
  expired: { icon: CheckCircle2, className: "text-muted-foreground bg-muted border-border" }
};

export default function ActiveAlerts({ doses }) {
  const activeDoses = doses.
  map((dose) => ({ dose, status: getDoseStatus(dose) })).
  filter((d) => d.status.phase !== "expired").
  sort((a, b) => {
    const order = { rising: 0, active: 0, waiting: 1, declining: 2 };
    return (order[a.status.phase] ?? 3) - (order[b.status.phase] ?? 3);
  });

  // Stacking warning: multiple active rapid/short-acting insulins
  const activeRapid = activeDoses.filter(
    (d) =>
    ["rising", "active", "declining"].includes(d.status.phase) &&
    ["Rapid-Acting", "Short-Acting"].includes(INSULIN_PROFILES[d.dose.insulin_type]?.category)
  );

  if (!activeDoses.length) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-[hsl(var(--popover))]">Active Alerts</h2>

      {activeRapid.length > 1 &&
      <div className="flex items-start gap-3 p-4 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-800">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">Insulin Stacking Detected</p>
            <p className="text-xs mt-0.5 opacity-80">
              {activeRapid.length} rapid/short-acting doses are active simultaneously. Monitor for low blood sugar.
            </p>
          </div>
        </div>
      }

      <div className="space-y-2">
        {activeDoses.map(({ dose, status }) => {
          const config = phaseConfig[status.phase] || phaseConfig.expired;
          const Icon = config.icon;
          const profile = INSULIN_PROFILES[dose.insulin_type];

          return (
            <div
              key={dose.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${config.className} transition-all`}>
              
              <div className="p-1.5 rounded-lg bg-white/60">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: profile?.color }} />
                  <p className="text-sm font-medium truncate">
                    {dose.insulin_type} — {dose.units}u
                  </p>
                </div>
                <p className="text-xs opacity-75 mt-0.5">{status.message}</p>
              </div>
              {status.minutesUntil !== undefined &&
              <span className="text-xs font-medium whitespace-nowrap">
                  {formatMinutes(status.minutesUntil)} left
                </span>
              }
            </div>);

        })}
      </div>
    </div>);

}