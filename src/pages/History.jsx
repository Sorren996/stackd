import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import DoseCard from "../components/DoseCard";
import GlucoseCard from "../components/GlucoseCard";
import CarbCard from "../components/CarbCard";
import { toast } from "sonner";
import { CalendarDays, ChevronRight, X, Pencil } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

function CollapsibleDateGroup({ label, count, isOpen, onToggle, children }) {
  return (
    <motion.div
      animate={{
        borderColor: isOpen ? "rgba(20, 184, 166, 0.4)" : "rgba(255, 255, 255, 0.05)",
        boxShadow: isOpen
          ? "0 0 15px rgba(20, 184, 166, 0.15), inset 0 0 0 1px rgba(20, 184, 166, 0.1)"
          : "0 0 0px rgba(0,0,0,0)"
      }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="bg-white/[0.02] border rounded-2xl overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white/90">{label}</span>
          <span className="text-sm bg-white/10 px-2 py-0.5 rounded-full text-white/50">
            {count} {count === 1 ? "log" : "logs"}
          </span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <ChevronRight className="w-4 h-4 text-white/40" />
        </motion.div>
      </button>

      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        className="overflow-hidden"
      >
        <div className="border-t border-white/5 divide-white/5 space-y-3">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function groupByDate(items, dateField) {
  const groups = {};
  items.forEach((item) => {
    const timestamp = item[dateField];
    if (!timestamp) return;

    const parsed = parseISO(timestamp);
    if (Number.isNaN(parsed.getTime())) return;

    const date = format(parsed, "yyyy-MM-dd");
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => {
      const d = parseISO(date);
      let label = format(d, "EEEE, MMMM d");
      if (isToday(d)) label = "Today";
      else if (isYesterday(d)) label = "Yesterday";
      return { date, label, items };
    });
}

function normalizeCarbEntry(entry) {
  const consumedAt = entry.consumed_at || entry.recorded_at || entry.created_date || entry.created_at;
  const carbs = Number(entry.carbs ?? entry.carbs_grams ?? entry.total_carbs ?? entry.totalCarbs ?? 0);
  const name = entry.food_name || entry.name || "Estimated meal";

  return {
    ...entry,
    id: entry.id || entry._id || `${consumedAt}-${name}-${carbs}`,
    name,
    food_name: name,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    consumed_at: consumedAt,
  };
}

function toTimeValue(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toTimeString().slice(0, 5) : date.toTimeString().slice(0, 5);
}

function mergeTime(originalTimestamp, timeValue) {
  const date = originalTimestamp ? new Date(originalTimestamp) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const [hours, minutes] = timeValue.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() > Date.now()) return null;
  return date.toISOString();
}

function replaceCachedItem(queryClient, queryKey, updatedItem) {
  queryClient.setQueryData(queryKey, (current = []) =>
    Array.isArray(current) ? current.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item)) : current
  );
}

function getEditInitialForm(log) {
  if (!log) return {};
  if (log.type === "insulin") {
    return {
      insulin_type: log.item.insulin_type || "",
      units: String(log.item.units ?? ""),
      meal_units: String(log.item.meal_units ?? ""),
      correction_units: String(log.item.correction_units ?? ""),
      time: toTimeValue(log.item.administered_at),
      notes: log.item.notes || "",
    };
  }
  if (log.type === "glucose") {
    return {
      value: String(log.item.value ?? ""),
      time: toTimeValue(log.item.recorded_at),
      notes: log.item.notes || "",
    };
  }
  return {
    food_name: log.item.food_name || log.item.name || "",
    carbs: String(log.item.carbs ?? ""),
    absorption_profile: log.item.absorption_profile || log.item.profile || "medium",
    time: toTimeValue(log.item.consumed_at),
    notes: log.item.notes || "",
  };
}

function formatTimeLabel(value) {
  const [hoursRaw, minutes = "00"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${minutes.padStart(2, "0")} ${suffix}`;
}

function buildTimeValue(hour12, minute, suffix) {
  let hour = Number(hour12) % 12;
  if (suffix === "PM") hour += 12;
  const safeMinute = Math.max(0, Math.min(55, Number(minute) || 0));
  return `${String(hour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function parseTimeValue(value) {
  const [hoursRaw = "0", minutesRaw = "0"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  return { hour12: hours % 12 || 12, minute: Math.max(0, Math.min(55, Math.floor(Number(minutesRaw) / 5) * 5)), suffix: hours >= 12 ? "PM" : "AM" };
}

const insulinTypeOptions = Object.entries(INSULIN_PROFILES).map(([name, profile]) => ({
  value: name,
  label: name,
  description: profile.category,
}));

const absorptionProfileOptions = [
  { value: "fast", label: "Fast", description: "Fast carbs" },
  { value: "medium", label: "Medium", description: "Balanced carbs" },
  { value: "slow", label: "Slow", description: "Slow carbs" },
];

function CustomInputTray({ open, onClose, title, children, tall = false }) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const absorb = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[998] bg-black/25"
        onPointerDown={absorb}
        onPointerUp={absorb}
        onClick={(event) => {
          absorb(event);
          onClose();
        }}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-[999] rounded-t-3xl border border-white/10 bg-[hsl(162,10%,8%)] px-4 pb-[max(env(safe-area-inset-bottom),0.85rem)] pt-3 shadow-[0_-24px_60px_rgba(0,0,0,0.55)] ${
          tall ? "min-h-[43dvh]" : "min-h-[34dvh]"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white/60">{title}</p>
          <button
            type="button"
            onClick={(event) => {
              absorb(event);
              onClose();
            }}
            className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold text-teal-200"
          >
            Done
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

function TimeScrollField({ label, value, onChange, max }) {
  const [open, setOpen] = useState(false);
  const parsed = parseTimeValue(value);
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  const updateTime = (patch) => {
    const next = { ...parsed, ...patch };
    const nextValue = buildTimeValue(next.hour12, next.minute, next.suffix);
    onChange(max && nextValue > max ? max : nextValue);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between">
        <span className="text-sm text-white/40">{label}</span>
        <span className="text-sm font-semibold text-white">{formatTimeLabel(value)}</span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label}>
        <div className="grid h-[27dvh] grid-cols-[1fr_1fr_0.9fr] gap-3">
          {[["hour12", hours], ["minute", minutes]].map(([key, values]) => (
            <div key={key} className="touch-pan-y overflow-y-auto rounded-2xl border border-white/10 bg-black/20 p-1" style={{ scrollbarWidth: "none" }}>
              {values.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    updateTime({ [key]: item });
                  }}
                  className={`mb-1 flex h-12 w-full items-center justify-center rounded-xl text-lg font-semibold transition last:mb-0 ${
                    parsed[key] === item ? "bg-teal-500 text-white" : "text-white/45 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {String(item).padStart(key === "minute" ? 2 : 1, "0")}
                </button>
              ))}
            </div>
          ))}
          <div className="grid gap-2">
            {["AM", "PM"].map((suffix) => (
              <button
                key={suffix}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  updateTime({ suffix });
                }}
                className={`rounded-2xl text-base font-bold transition ${
                  parsed.suffix === suffix ? "bg-teal-500 text-white" : "border border-white/10 bg-black/20 text-white/45"
                }`}
              >
                {suffix}
              </button>
            ))}
          </div>
        </div>
      </CustomInputTray>
    </div>
  );
}

function NumberPadField({ label, value, onChange, unit, placeholder = "--", decimal = true, maxLength = 6, large = false }) {
  const [open, setOpen] = useState(false);
  const textValue = value === undefined || value === null ? "" : String(value);
  const press = (key) => {
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(textValue.slice(0, -1));
    if (key === "." && (!decimal || textValue.includes("."))) return;
    if (textValue.length >= maxLength) return;
    onChange(`${textValue}${key}`);
  };

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-3 ${large ? "px-6 py-6" : ""}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3">
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
        <span className={`${large ? "text-5xl" : "text-base"} text-right font-bold text-white`}>
          {textValue || placeholder}{unit && <span className="ml-1 text-xs text-white/35">{unit}</span>}
        </span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label}>
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                press(key);
              }}
              className="h-14 rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-bold text-white/85 transition hover:bg-white/10 active:scale-[0.98]"
            >
              {key === "back" ? "Back" : key === "clear" ? "Clear" : key}
            </button>
          ))}
        </div>
      </CustomInputTray>
    </div>
  );
}

function TextPadField({ label, value, onChange, placeholder, multiline = false }) {
  const [open, setOpen] = useState(false);
  const rows = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const add = (key) => onChange(`${value || ""}${key}`);

  return (
    <div>
      {label && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm text-white outline-none transition ${multiline ? "min-h-20" : ""}`}
      >
        {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-white/30">{placeholder}</span>}
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label || "Text"} tall>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-2">
          {rows.map((row) => (
            <div key={row} className="mb-1.5 flex justify-center gap-1.5 last:mb-0">
              {[...row].map((letter) => (
                <button key={letter} type="button" onClick={(event) => {
                    event.stopPropagation();
                    add(letter.toLowerCase());
                  }} className="h-12 min-w-0 flex-1 rounded-xl bg-white/10 text-sm font-bold text-white/85 active:scale-[0.98]">
                  {letter}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-2 grid grid-cols-[1fr_1fr_2fr_1fr_1fr] gap-2">
            <button type="button" onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }} className="h-12 rounded-xl bg-white/10 text-xs font-bold text-white/65">Clear</button>
            <button type="button" onClick={(event) => {
              event.stopPropagation();
              add(",");
            }} className="h-12 rounded-xl bg-white/10 text-xs font-bold text-white/65">,</button>
            <button type="button" onClick={(event) => {
              event.stopPropagation();
              add(" ");
            }} className="h-12 rounded-xl bg-white/10 text-xs font-bold text-white/65">Space</button>
            <button type="button" onClick={(event) => {
              event.stopPropagation();
              add(".");
            }} className="h-12 rounded-xl bg-white/10 text-xs font-bold text-white/65">.</button>
            <button type="button" onClick={(event) => {
              event.stopPropagation();
              onChange(String(value || "").slice(0, -1));
            }} className="h-12 rounded-xl bg-white/10 text-xs font-bold text-white/65">Back</button>
          </div>
        </div>
      </CustomInputTray>
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder = "Select" }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <button type="button" onClick={() => setOpen((current) => !current)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
        <span className="min-w-0 text-right text-sm font-semibold text-white">
          {selected ? selected.label : <span className="text-white/30">{placeholder}</span>}
        </span>
      </button>
      <CustomInputTray open={open} onClose={() => setOpen(false)} title={label} tall>
        <div className="max-h-[34dvh] touch-pan-y space-y-2 overflow-y-auto pr-1" style={{ scrollbarWidth: "none" }}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                  isSelected ? "border-teal-500/45 bg-teal-500/12 text-white" : "border-white/10 bg-white/[0.04] text-white/55"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{option.label}</span>
                  {option.description && <span className="text-[10px] uppercase tracking-wider text-white/30">{option.description}</span>}
                </span>
                <span className={`h-3 w-3 rounded-full ${isSelected ? "bg-teal-300" : "bg-white/15"}`} />
              </button>
            );
          })}
        </div>
      </CustomInputTray>
    </div>
  );
}

function EditLogSheet({ log, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(() => getEditInitialForm(log));

  useEffect(() => {
    setForm(getEditInitialForm(log));
  }, [log]);

  if (!log) return null;

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const title = log.type === "insulin" ? "Edit Insulin" : log.type === "glucose" ? "Edit Glucose" : "Edit Carbs";

  const submit = () => {
    if (log.type === "insulin") {
      const units = Number(form.units);
      if (!form.insulin_type || !Number.isFinite(units) || units <= 0) return;
      const administeredAt = mergeTime(log.item.administered_at, form.time);
      if (!administeredAt) {
        toast.error("Choose a time that is not in the future.");
        return;
      }
      const mealUnits = form.meal_units === "" ? undefined : Number(form.meal_units);
      const correctionUnits = form.correction_units === "" ? undefined : Number(form.correction_units);
      onSave({
        type: "insulin",
        id: log.item.id,
        patch: {
          insulin_type: form.insulin_type,
          units,
          meal_units: Number.isFinite(mealUnits) ? mealUnits : undefined,
          correction_units: Number.isFinite(correctionUnits) ? correctionUnits : undefined,
          administered_at: administeredAt,
          notes: form.notes || undefined,
        },
      });
      return;
    }

    if (log.type === "glucose") {
      const value = Number(form.value);
      if (!Number.isFinite(value) || value <= 0) return;
      const recordedAt = mergeTime(log.item.recorded_at, form.time);
      if (!recordedAt) {
        toast.error("Choose a time that is not in the future.");
        return;
      }
      onSave({
        type: "glucose",
        id: log.item.id,
        patch: {
          value,
          recorded_at: recordedAt,
          notes: form.notes || undefined,
        },
      });
      return;
    }

    const carbs = Number(form.carbs);
    if (!Number.isFinite(carbs) || carbs <= 0) return;
    const consumedAt = mergeTime(log.item.consumed_at, form.time);
    if (!consumedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }
    onSave({
      type: "carbs",
      id: log.item.id,
      patch: {
        name: form.food_name || "Food",
        food_name: form.food_name || "Food",
        carbs,
        absorption_profile: form.absorption_profile || "medium",
        profile: form.absorption_profile || "medium",
        consumed_at: consumedAt,
        notes: form.notes || undefined,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/75 px-3 pb-24 pt-6 sm:items-center sm:px-4 sm:pb-6 sm:backdrop-blur-sm">
      <div className="edit-log-sheet max-h-[calc(100dvh-8rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)]" style={{ background: "hsl(162,10%,8%)" }}>
        <style>{`
          .edit-log-sheet input,
          .edit-log-sheet select,
          .edit-log-sheet textarea {
            font-size: 16px;
          }
        `}</style>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {log.type === "insulin" && (
            <>
              <SelectField
                label="Insulin type"
                value={form.insulin_type}
                onChange={(value) => updateField("insulin_type", value)}
                options={insulinTypeOptions}
                placeholder="Insulin type"
              />
              <div className="grid grid-cols-1 gap-2">
                <NumberPadField label="Total" value={form.units} onChange={(value) => updateField("units", value)} />
                <NumberPadField label="Meal" value={form.meal_units} onChange={(value) => updateField("meal_units", value)} />
                <NumberPadField label="Correction" value={form.correction_units} onChange={(value) => updateField("correction_units", value)} />
              </div>
            </>
          )}

          {log.type === "glucose" && (
            <NumberPadField label="Glucose" value={form.value} onChange={(value) => updateField("value", value.replace(/\D/g, "").slice(0, 3))} decimal={false} maxLength={3} />
          )}

          {log.type === "carbs" && (
            <>
              <TextPadField label="Food" value={form.food_name} onChange={(value) => updateField("food_name", value)} placeholder="Food" />
              <div className="grid grid-cols-2 gap-2">
                <NumberPadField label="Carbs" value={form.carbs} onChange={(value) => updateField("carbs", value)} />
                <SelectField
                  label="Absorption"
                  value={form.absorption_profile}
                  onChange={(value) => updateField("absorption_profile", value)}
                  options={absorptionProfileOptions}
                />
              </div>
            </>
          )}

          <TimeScrollField label="Logged at" value={form.time} onChange={(value) => updateField("time", value)} />
          <TextPadField label="Notes" value={form.notes} onChange={(value) => updateField("notes", value)} placeholder="Notes" multiline />
          <button type="button" onClick={submit} disabled={isSaving} className="sticky bottom-0 w-full rounded-2xl bg-teal-500 py-4 text-base font-semibold text-white shadow-[0_-16px_24px_rgba(10,18,16,0.9)] transition hover:bg-teal-400 disabled:opacity-40">
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditableLog({ children, onEdit }) {
  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit log"
        className="absolute right-12 top-4 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/35 transition hover:bg-white/10 hover:text-white/80"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function History() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("doses");
  const [openGroup, setOpenGroup] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [targetRange, setTargetRange] = useState(readTargetRange);

  useEffect(() => {
    const updateTargetRange = () => setTargetRange(readTargetRange());

    window.addEventListener("target-range-updated", updateTargetRange);
    window.addEventListener("storage", updateTargetRange);

    return () => {
      window.removeEventListener("target-range-updated", updateTargetRange);
      window.removeEventListener("storage", updateTargetRange);
    };
  }, []);

  const { data: doses = [], isLoading: loadingDoses } = useQuery({
    queryKey: ["insulin-doses"],
    queryFn: () => base44.entities.InsulinDose.list("-administered_at", 200)
  });

  const { data: glucoseReadings = [], isLoading: loadingGlucose } = useQuery({
    queryKey: ["glucose-readings"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 1000)
  });

  const { data: carbEntries = [], isLoading: loadingCarbs } = useQuery({
    queryKey: ["carb-entries"],
    queryFn: () => base44.entities.CarbEntry.list("-consumed_at", 300)
  });

  const deleteDose = useMutation({
    mutationFn: (id) => base44.entities.InsulinDose.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      toast.success("Dose removed");
    }
  });

  const deleteGlucose = useMutation({
    mutationFn: (id) => base44.entities.GlucoseReading.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
      toast.success("Glucose reading removed");
    }
  });

  const deleteCarb = useMutation({
    mutationFn: (id) => base44.entities.CarbEntry.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      toast.success("Carb entry removed");
    }
  });

  const updateLog = useMutation({
    mutationFn: ({ type, id, patch }) => {
      if (type === "insulin") return base44.entities.InsulinDose.update(id, patch);
      if (type === "glucose") return base44.entities.GlucoseReading.update(id, patch);
      return base44.entities.CarbEntry.update(id, patch);
    },
    onSuccess: (updated, variables) => {
      const updatedItem = { ...editingLog?.item, ...variables.patch, ...updated, id: variables.id };

      if (variables.type === "insulin") {
        replaceCachedItem(queryClient, ["insulin-doses"], updatedItem);
        replaceCachedItem(queryClient, ["insulin-doses", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
        queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      } else if (variables.type === "glucose") {
        replaceCachedItem(queryClient, ["latest-glucose"], updatedItem);
        replaceCachedItem(queryClient, ["glucose-readings"], updatedItem);
        replaceCachedItem(queryClient, ["glucose-readings", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
        queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
        queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      } else {
        replaceCachedItem(queryClient, ["carb-entries"], updatedItem);
        replaceCachedItem(queryClient, ["carb-entries", "graph"], updatedItem);
        queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
        queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      }

      toast.success("Log updated");
      setEditingLog(null);
    },
    onError: () => toast.error("Unable to update log. Please try again."),
  });

  const normalizedCarbEntries = useMemo(
    () => carbEntries.map(normalizeCarbEntry).filter((entry) => entry.consumed_at && entry.carbs > 0),
    [carbEntries]
  );

  const doseGroups = groupByDate(doses, "administered_at");
  const carbGroups = groupByDate(normalizedCarbEntries, "consumed_at");

  const getCarbAverage = (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = normalizedCarbEntries.filter((e) => new Date(e.consumed_at).getTime() >= cutoff);
    if (!filtered.length) return "—";
    const totalDays = Math.max(1, Math.ceil((Date.now() - Math.min(...filtered.map(e => new Date(e.consumed_at).getTime()))) / (24*60*60*1000)) || days);
    const sum = filtered.reduce((acc, e) => acc + e.carbs, 0);
    return `${Math.round(sum / Math.min(days, totalDays))}`;
  };

  const totalCarbsLast30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return normalizedCarbEntries.filter(e => new Date(e.consumed_at).getTime() >= cutoff).reduce((acc, e) => acc + e.carbs, 0);
  }, [normalizedCarbEntries]);

  const glucose30Days = glucoseReadings.filter((r) => {
    return Date.now() - new Date(r.recorded_at).getTime() <= 30 * 24 * 60 * 60 * 1000;
  });
  const glucoseGroups = groupByDate(glucose30Days, "recorded_at");

  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;

  const inRangePercentage = useMemo(() => {
    if (!glucoseReadings.length) return "—";
    const inRangeCount = glucoseReadings.filter(
      (r) => r.value >= targetLow && r.value <= targetHigh
    ).length;
    return `${Math.round((inRangeCount / glucoseReadings.length) * 100)}%`;
  }, [glucoseReadings, targetLow, targetHigh]);

  const getAverage = (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = glucoseReadings.filter((r) => new Date(r.recorded_at).getTime() >= cutoff);
    if (!filtered.length) return "—";
    const sum = filtered.reduce((acc, curr) => acc + curr.value, 0);
    return `${Math.round(sum / filtered.length)}`;
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setOpenGroup(null);
  };

  if (loadingDoses || loadingGlucose || loadingCarbs) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <EditLogSheet
        log={editingLog}
        onClose={() => setEditingLog(null)}
        onSave={(payload) => updateLog.mutate(payload)}
        isSaving={updateLog.isPending}
      />

      <div className="flex justify-center">
        <div
          className="flex items-center gap-1 p-1 rounded-3xl border border-white/20 bg-white/5 shadow-lg sm:backdrop-blur-sm"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)"
          }}>
          <button
            onClick={() => handleTabChange("doses")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "doses" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "doses" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative z-10">Insulin Doses</span>
          </button>

          <button
            onClick={() => handleTabChange("glucose")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "glucose" ? "text-white" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "glucose" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 bg-white/10 rounded-2xl -z-10"
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative z-10">Glucose Readings</span>
          </button>

          <button
            onClick={() => handleTabChange("carbs")}
            className={`relative px-4 py-2 rounded-2xl text-sm font-medium transition-colors ${
              activeTab === "carbs" ? "text-amber-400" : "text-white/40 hover:text-white/70"
            }`}>
            {activeTab === "carbs" && (
              <motion.div
                layoutId="active-history-tab"
                className="absolute inset-0 rounded-2xl -z-10"
                style={{ backgroundColor: "rgba(245,158,11,0.15)" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }} />
            )}
            <span className="relative z-10">Carb Log</span>
          </button>
        </div>
      </div>

      {activeTab === "doses" && (
        <div className="space-y-6">
          {doseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No doses logged yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Head to the Dashboard to log your first dose.</p>
            </div>
          ) : (
            doseGroups.map((group) => (
              <CollapsibleDateGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((dose) => (
                  <EditableLog key={dose.id} onEdit={() => setEditingLog({ type: "insulin", item: dose })}>
                    <DoseCard dose={dose} onDelete={(id) => deleteDose.mutate(id)} />
                  </EditableLog>
                ))}
              </CollapsibleDateGroup>
            ))
          )}
        </div>
      )}

      {activeTab === "glucose" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "1 Day", days: 1 },
              { label: "3 Day", days: 3 },
              { label: "7 Day", days: 7 },
              { label: "14 Day", days: 14 },
              { label: "30 Day", days: 30 }
            ].map((window) => (
              <div key={window.label} className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{window.label} Avg</p>
                <p className="text-xl text-white mt-1 font-extrabold text-center">{getAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">mg/dL</p>
              </div>
            ))}
            <div className="bg-white/5 border border-teal-500/20 rounded-2xl p-3 text-center" style={{ boxShadow: "0 0 15px rgba(20, 184, 166, 0.05)" }}>
              <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">In Range</p>
              <p className="text-xl text-teal-400 mt-1 font-extrabold text-center">{inRangePercentage}</p>
              <p className="text-[10px] text-teal-400/50 mt-0.5">{targetLow}–{targetHigh} mg/dL</p>
            </div>
          </div>

          {glucoseGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No glucose logs for the last 30 days</h3>
              <p className="text-sm text-muted-foreground mt-1">Glucose logs recorded in the dashboard will appear here.</p>
            </div>
          ) : (
            glucoseGroups.map((group) => (
              <CollapsibleDateGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((reading) => (
                  <EditableLog key={reading.id} onEdit={() => setEditingLog({ type: "glucose", item: reading })}>
                    <GlucoseCard reading={reading} onDelete={(id) => deleteGlucose.mutate(id)} />
                  </EditableLog>
                ))}
              </CollapsibleDateGroup>
            ))
          )}
        </div>
      )}

      {activeTab === "carbs" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "1 Day Avg", days: 1 },
              { label: "7 Day Avg", days: 7 },
              { label: "14 Day Avg", days: 14 },
              { label: "30 Day Avg", days: 30 },
            ].map((window) => (
              <div key={window.label} className="bg-white/5 border border-white/5 rounded-2xl p-3 text-center">
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider">{window.label}</p>
                <p className="text-xl text-white mt-1 font-extrabold">{getCarbAverage(window.days)}</p>
                <p className="text-[10px] text-white/30 mt-0.5">g / day</p>
              </div>
            ))}
          </div>
          <div className="bg-white/5 border border-amber-500/20 rounded-2xl p-3 text-center" style={{ boxShadow: "0 0 15px rgba(245,158,11,0.05)" }}>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Total Carbs (30 Days)</p>
            <p className="text-2xl text-amber-400 mt-1 font-extrabold">{totalCarbsLast30}g</p>
          </div>

          {carbGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <h3 className="text-lg font-semibold">No carb entries yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Log food from the Dashboard to see it here.</p>
            </div>
          ) : (
            carbGroups.map((group) => (
              <CollapsibleDateGroup
                key={group.date}
                label={group.label}
                count={group.items.length}
                isOpen={openGroup === group.date}
                onToggle={() => setOpenGroup(openGroup === group.date ? null : group.date)}
              >
                {group.items.map((entry) => (
                  <EditableLog key={entry.id} onEdit={() => setEditingLog({ type: "carbs", item: entry })}>
                    <CarbCard entry={entry} onDelete={(id) => deleteCarb.mutate(id)} />
                  </EditableLog>
                ))}
              </CollapsibleDateGroup>
            ))
          )}
        </div>
      )}
    </div>
  );
}