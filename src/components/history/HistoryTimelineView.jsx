import { useMemo, useState } from "react";
import { Pencil, Droplets, Syringe, Wheat } from "lucide-react";
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

const GROUPS = [
  { key: "glucose", label: "Glucose", Icon: Droplets, color: "#5ba88a" },
  { key: "insulin", label: "Insulin", Icon: Syringe, color: "#5ba3b8" },
  { key: "carbs", label: "Carbs", Icon: Wheat, color: "#f59e0b" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "glucose", label: "Glucose" },
  { key: "insulin", label: "Insulin" },
  { key: "carbs", label: "Carbs" },
];

function renderCard(item, groupKey, locked, onEdit, onDeleteDose, onDeleteGlucose, onDeleteCarb) {
  const handleEdit = () => onEdit({ type: groupKey, item });

  if (groupKey === "insulin") {
    const card = <DoseCard dose={item} locked={locked} onDelete={(id) => onDeleteDose(id)} />;
    return locked ? (
      <div key={`dose-${item.id}`}>{card}</div>
    ) : (
      <EditableLog key={`dose-${item.id}`} onEdit={handleEdit}>
        {card}
      </EditableLog>
    );
  }

  if (groupKey === "carbs") {
    const card = <CarbCard entry={item} locked={locked} onDelete={(id) => onDeleteCarb(id)} />;
    return locked ? (
      <div key={`carb-${item.id}`}>{card}</div>
    ) : (
      <EditableLog key={`carb-${item.id}`} onEdit={handleEdit}>
        {card}
      </EditableLog>
    );
  }

  const card = <GlucoseCard reading={item} locked={locked} onDelete={(id) => onDeleteGlucose(id)} />;
  return locked ? (
    <div key={`glucose-${item.id}`}>{card}</div>
  ) : (
    <EditableLog key={`glucose-${item.id}`} onEdit={handleEdit}>
      {card}
    </EditableLog>
  );
}

export default function HistoryTimelineView({ logs, loading, onEdit, onDeleteDose, onDeleteGlucose, onDeleteCarb }) {
  const [filter, setFilter] = useState("all");

  const grouped = useMemo(() => {
    const map = { glucose: [], insulin: [], carbs: [] };
    (Array.isArray(logs) ? logs : []).forEach((item) => {
      if (map[item.feedType]) map[item.feedType].push(item);
    });
    // Each group stays chronological (logs already arrive sorted desc by timestamp).
    return map;
  }, [logs]);

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

  const visibleGroups = GROUPS.filter(
    (g) => (filter === "all" || filter === g.key) && grouped[g.key].length > 0
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-teal-500/40 bg-teal-500/10 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/45 hover:text-white/75"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {visibleGroups.length === 0 && (
        <p className="py-8 text-center text-sm text-white/40">No moments match this view.</p>
      )}

      {visibleGroups.map((g) => (
        <div key={g.key} className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <g.Icon className="h-3.5 w-3.5" style={{ color: g.color }} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: g.color }}>
              {g.label}
            </span>
            <span className="text-[10px] text-white/30">{grouped[g.key].length}</span>
          </div>
          <div className="space-y-2">
            {grouped[g.key].map((item) =>
              renderCard(item, g.key, isLogLocked(item), onEdit, onDeleteDose, onDeleteGlucose, onDeleteCarb)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}