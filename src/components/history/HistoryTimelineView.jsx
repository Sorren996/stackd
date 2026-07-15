import { Pencil } from "lucide-react";
import DoseCard from "@/components/DoseCard";
import GlucoseCard from "@/components/GlucoseCard";
import CarbCard from "@/components/CarbCard";

const LOCK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// A log is archived once the server has locked it, or — as an immediate
// client-side fallback — once it crosses the 14-day editable window.
export function isLogLocked(item) {
  if (item?.is_locked === true) return true;
  const ts = item?.recorded_at || item?.consumed_at || item?.administered_at;
  if (!ts) return false;
  const t = new Date(ts).getTime();
  return Number.isFinite(t) && Date.now() - t > LOCK_WINDOW_MS;
}

function EditableLog({ children, onEdit }) {
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit log"
        className="absolute right-12 top-4 flex h-7 w-7 items-center justify-center rounded-full border text-white/55 transition hover:text-white"
        style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.12)" }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function HistoryTimelineView({ logs, loading, onEdit, onDeleteDose, onDeleteGlucose, onDeleteCarb }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!logs.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-white/50">No moments logged on this day.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((item) => {
        const locked = isLogLocked(item);

        if (item.feedType === "insulin") {
          const card = <DoseCard dose={item} locked={locked} onDelete={(id) => onDeleteDose(id)} />;
          return locked ? (
            <div key={`dose-${item.id}`}>{card}</div>
          ) : (
            <EditableLog key={`dose-${item.id}`} onEdit={() => onEdit({ type: "insulin", item })}>
              {card}
            </EditableLog>
          );
        }

        if (item.feedType === "carbs") {
          const card = <CarbCard entry={item} locked={locked} onDelete={(id) => onDeleteCarb(id)} />;
          return locked ? (
            <div key={`carb-${item.id}`}>{card}</div>
          ) : (
            <EditableLog key={`carb-${item.id}`} onEdit={() => onEdit({ type: "carbs", item })}>
              {card}
            </EditableLog>
          );
        }

        const card = <GlucoseCard reading={item} locked={locked} onDelete={(id) => onDeleteGlucose(id)} />;
        return locked ? (
          <div key={`glucose-${item.id}`}>{card}</div>
        ) : (
          <EditableLog key={`glucose-${item.id}`} onEdit={() => onEdit({ type: "glucose", item })}>
            {card}
          </EditableLog>
        );
      })}
    </div>
  );
}