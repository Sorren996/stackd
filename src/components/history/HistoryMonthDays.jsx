import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { GLASS_SURFACE } from "@/lib/glassTheme";

function dayAvg(day) {
  return day.glucose.count ? Math.round(day.glucose.sum / day.glucose.count) : null;
}

function dayTir(day) {
  return day.glucose.count ? Math.round((day.glucose.inRange / day.glucose.count) * 100) : null;
}

export default function HistoryMonthDays({ days, onSelectDay }) {
  if (!days.length) {
    return (
      <p className="py-10 text-center text-sm text-white/40">No moments this month yet.</p>
    );
  }

  return (
    <div className="space-y-2.5">
      {days.map((day) => {
        const parsed = parseISO(day.date);
        const avg = dayAvg(day);
        const tir = dayTir(day);
        const hasGlucose = day.glucose.count > 0;
        const carbs = Math.round(day.carbs.total);
        const insulin = Math.round(day.insulin.total);

        return (
          <motion.button
            key={day.date}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectDay(day.date)}
            className="flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.04]"
            style={GLASS_SURFACE}
          >
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-white">{format(parsed, "EEEE, MMMM d")}</span>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                {hasGlucose ? (
                  <>
                    <span className="text-lg font-black text-white">
                      {avg}
                      <span className="ml-0.5 text-[10px] font-medium text-white/40">mg/dL</span>
                    </span>
                    <span className="text-xs font-semibold text-teal-300/80">{tir}% in range</span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-white/40">No glucose data</span>
                )}
                <span className="text-[11px] text-white/45">
                  {carbs > 0 && <>{carbs}g nourishment</>}
                  {carbs > 0 && insulin > 0 && <span className="mx-1 text-white/20">·</span>}
                  {insulin > 0 && <>{insulin}u support</>}
                </span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/40" />
          </motion.button>
        );
      })}
    </div>
  );
}