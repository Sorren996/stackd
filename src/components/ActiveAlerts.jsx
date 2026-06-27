import { getDoseStatus, formatMinutes, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Clock, TrendingUp, TrendingDown, CheckCircle2, Zap } from "lucide-react";

const phaseConfig = {
  waiting: {
    icon: Clock,
    className: "border-amber-200 bg-amber-50 text-amber-600",
    label: "Waiting",
  },
  rising: {
    icon: TrendingUp,
    className: "border-blue-200 bg-blue-50 text-blue-600",
    label: "Rising",
  },
  active: {
    icon: Zap,
    className: "border-emerald-200 bg-emerald-50 text-emerald-600",
    label: "Active",
  },
  declining: {
    icon: TrendingDown,
    className: "border-violet-200 bg-violet-50 text-violet-600",
    label: "Declining",
  },
  expired: {
    icon: CheckCircle2,
    className: "border-white/10 text-white/40",
    label: "Complete",
  },
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
      <h2 className="active-alerts-title px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
        Active Alerts
      </h2>

      <div className="space-y-2">
        {activeDoses.map(({ dose, status }) => {
          const config = phaseConfig[status.phase] || phaseConfig.expired;
          const Icon = config.icon;
          const profile = INSULIN_PROFILES[dose.insulin_type];

          return (
            <div key={dose.id} className="active-alert-row bg-transparent flex items-center gap-3 rounded-xl p-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center bg-transparent rounded-lg  ${config.className}`}>

                <Icon className="h-4 w-4" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: profile?.color || "#35a879" }} />
                  <p className="truncate text-sm font-semibold text-white">
                    {dose.insulin_type} - {dose.units}u
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-white/55">{status.message}</p>
                {status.minutesUntil !== undefined && (
                  <p className="mt-1 text-xs font-semibold text-white/70">
                    {formatMinutes(status.minutesUntil)} left
                  </p>
                )}
              </div>

              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
