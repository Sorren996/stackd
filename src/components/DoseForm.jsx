import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { X, Syringe, Droplets, Wheat, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";

const CarbsTab = lazy(() => import("@/components/CarbsTab"));
const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";
const TAB_ORDER = ["insulin", "glucose", "carbs"];
const tabPanelVariants = {
  enter: (direction) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
};

const CATEGORY_ORDER = [
  "Rapid-Acting",
  "Short-Acting",
  "Intermediate",
  "Long-Acting",
  "Ultra Long-Acting",
];

const groupedInsulins = CATEGORY_ORDER.reduce((groups, category) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, profile]) => profile.category === category);
  if (items.length) groups.push({ category, items });
  return groups;
}, []);

const insulinTypeOptions = Object.entries(INSULIN_PROFILES).map(([name, profile]) => ({
  value: name,
  label: name,
  description: profile.category,
}));

const dosePurposeOptions = [
  { value: "meal", label: "Meal", description: "Carb coverage" },
  { value: "correction", label: "Correction", description: "Glucose correction" },
];

function createInsulinRow(defaults = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    insulinType: "",
    units: "",
    purpose: "meal",
    ...defaults,
  };
}

function normalizeCarbEntryForSave(entry) {
  const absorptionProfile = entry.absorption_profile || entry.profile || "medium";
  const categoryByProfile = {
    fast: "Fast Absorbing",
    medium: "Medium Absorbing",
    slow: "Slow Absorbing",
  };
  const name = entry.food_name || entry.name || "Estimated meal";
  const carbs = Number(entry.carbs);

  return {
    name,
    food_name: name,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    gi: Number(entry.gi) || 50,
    category: entry.category || categoryByProfile[absorptionProfile] || "Medium Absorbing",
    profile: absorptionProfile,
    absorption_profile: absorptionProfile,
    serving_amount: entry.serving_amount ?? 1,
    consumed_at: entry.consumed_at || new Date().toISOString(),
    is_custom: entry.is_custom === true,
  };
}

function writeCachedLatestGlucose(reading) {
  if (typeof window === "undefined" || !reading) return;

  try {
    window.localStorage.setItem(LATEST_GLUCOSE_CACHE_KEY, JSON.stringify(reading));
    window.dispatchEvent(new Event("latest-glucose-updated"));
  } catch {
    // Cache is optional; React Query still refreshes from the backend.
  }
}

function prependUnique(entries, current = []) {
  const ids = new Set(entries.map((entry) => entry.id).filter(Boolean));
  return [...entries, ...current.filter((entry) => !ids.has(entry.id))];
}

function formatTimeLabel(value) {
  const [hoursRaw, minutes = "00"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.padStart(2, "0")} ${suffix}`;
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
  return {
    hour12: hours % 12 || 12,
    minute: Math.max(0, Math.min(55, Math.floor(Number(minutesRaw) / 5) * 5)),
    suffix: hours >= 12 ? "PM" : "AM",
  };
}

function buildTodayTimestampNoFuture(timeValue) {
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.getTime() > Date.now() ? null : date;
}

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

export default function DoseForm({ open, onOpenChange }) {
  const [renderSheet, setRenderSheet] = useState(open);
  const [tab, setTab] = useState("insulin");
  const [tabDirection, setTabDirection] = useState(1);
  const [insulinRows, setInsulinRows] = useState(() => [createInsulinRow()]);
  const [insulinNotes, setInsulinNotes] = useState("");
  const [insulinTime, setInsulinTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [glucoseValue, setGlucoseValue] = useState("");
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [glucoseTime, setGlucoseTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [loggingTab, setLoggingTab] = useState(null);

  const queryClient = useQueryClient();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

  useEffect(() => {
    setRenderSheet(open);
  }, [open]);

  const requestClose = () => {
    setRenderSheet(false);
    onOpenChange?.(false);
  };

  const closeWithSpring = (resetForm) => {
    requestClose();
    const scheduleReset = typeof window === "undefined" ? setTimeout : window.setTimeout;
    scheduleReset(resetForm, 320);
  };
  const closeAfterLoggingPaint = (resetForm) => {
    const scheduleClose = typeof window === "undefined" ? setTimeout : window.setTimeout;
    const close = () => {
      scheduleClose(() => {
        closeWithSpring(() => {
          resetForm();
          setLoggingTab(null);
        });
      }, 220);
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(close));
      return;
    }

    scheduleClose(close, 0);
  };
  const runSaveAfterLoggingPaint = (save, resetForm) => {
    const start = () => {
      save();
      closeAfterLoggingPaint(resetForm);
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => window.setTimeout(start, 0));
      return;
    }

    setTimeout(start, 0);
  };
  const handleDialogOpenChange = (nextOpen) => {
    if (nextOpen) {
      setRenderSheet(true);
      onOpenChange?.(true);
      return;
    }

    requestClose();
  };

  const handleTabChange = (nextTab) => {
    if (nextTab === tab) return;

    const currentIndex = TAB_ORDER.indexOf(tab);
    const nextIndex = TAB_ORDER.indexOf(nextTab);
    setTabDirection(nextIndex > currentIndex ? 1 : -1);
    setTab(nextTab);
  };

  const createDoses = useMutation({
    mutationFn: ({ submittedDoses }) => base44.entities.InsulinDose.bulkCreate(submittedDoses),
    onMutate: ({ optimisticDoses }) => {
      const previousDoses = queryClient.getQueryData(["insulin-doses"]);
      const previousGraphDoses = queryClient.getQueryData(["insulin-doses", "graph"]);
      queryClient.setQueryData(["insulin-doses"], (current = []) => prependUnique(optimisticDoses, current));
      queryClient.setQueryData(["insulin-doses", "graph"], (current = []) => prependUnique(optimisticDoses, current));
      return { optimisticIds: optimisticDoses.map((dose) => dose.id), previousDoses, previousGraphDoses };
    },
    onSuccess: (createdDoses, variables, context) => {
      const optimisticIds = new Set(context?.optimisticIds || []);
      const savedDoses = Array.isArray(createdDoses) && createdDoses.length ? createdDoses : variables.submittedDoses;
      queryClient.setQueryData(["insulin-doses"], (current = []) => prependUnique(savedDoses, current.filter((dose) => !optimisticIds.has(dose.id))));
      queryClient.setQueryData(["insulin-doses", "graph"], (current = []) => prependUnique(savedDoses, current.filter((dose) => !optimisticIds.has(dose.id))));
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      toast.success("Insulin logged - tracking activity now");
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["insulin-doses"], context?.previousDoses ?? []);
      queryClient.setQueryData(["insulin-doses", "graph"], context?.previousGraphDoses ?? []);
      toast.error("Unable to log insulin. Please try again.");
    },
  });

  const createGlucose = useMutation({
    mutationFn: ({ submittedReading }) => base44.entities.GlucoseReading.create(submittedReading),
    onMutate: ({ optimisticReading }) => {
      const previousLatestGlucose = queryClient.getQueryData(["latest-glucose"]);
      const previousGraphGlucose = queryClient.getQueryData(["glucose-readings", "graph"]);
      writeCachedLatestGlucose(optimisticReading);
      queryClient.setQueryData(["latest-glucose"], [optimisticReading]);
      queryClient.setQueryData(["glucose-readings", "graph"], (current = []) => prependUnique([optimisticReading], current));
      return { optimisticId: optimisticReading.id, previousLatestGlucose, previousGraphGlucose };
    },
    onSuccess: (createdReading, variables, context) => {
      const savedReading = createdReading || variables.submittedReading;
      writeCachedLatestGlucose(savedReading);
      queryClient.setQueryData(["latest-glucose"], [savedReading]);
      queryClient.setQueryData(["glucose-readings", "graph"], (current = []) =>
        prependUnique([savedReading], current.filter((reading) => reading.id !== context?.optimisticId))
      );
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      toast.success("Glucose logged");
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["latest-glucose"], context?.previousLatestGlucose ?? []);
      queryClient.setQueryData(["glucose-readings", "graph"], context?.previousGraphGlucose ?? []);
      toast.error("Unable to log glucose. Please try again.");
    },
  });

  const createCarb = useMutation({
    mutationFn: async ({ submittedEntries }) => {
      const savePromise = submittedEntries.length === 1
        ? base44.entities.CarbEntry.create(submittedEntries[0]).then((entry) => [entry])
        : base44.entities.CarbEntry.bulkCreate(submittedEntries);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Carb save timed out after 10 seconds")), 10000);
      });

      return Promise.race([savePromise, timeoutPromise]);
    },
    onMutate: ({ optimisticEntries }) => {
      const previousCarbs = queryClient.getQueryData(["carb-entries"]);
      const previousGraphCarbs = queryClient.getQueryData(["carb-entries", "graph"]);
      queryClient.setQueryData(["carb-entries"], (current = []) => prependUnique(optimisticEntries, current));
      queryClient.setQueryData(["carb-entries", "graph"], (current = []) => prependUnique(optimisticEntries, current));
      return { optimisticIds: optimisticEntries.map((entry) => entry.id), previousCarbs, previousGraphCarbs };
    },
    onSuccess: (result, variables, context) => {
      const optimisticIds = new Set(context?.optimisticIds || []);
      const submittedEntries = variables.submittedEntries;
      const savedEntries = Array.isArray(result) && result.length ? result.map((entry, index) => ({
        ...submittedEntries[index],
        ...entry,
      })) : submittedEntries;

      queryClient.setQueryData(["carb-entries"], (current = []) => prependUnique(savedEntries, current.filter((entry) => !optimisticIds.has(entry.id))));
      queryClient.setQueryData(["carb-entries", "graph"], (current = []) => prependUnique(savedEntries, current.filter((entry) => !optimisticIds.has(entry.id))));
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      toast.success(`Logged ${submittedEntries.length} food item${submittedEntries.length === 1 ? "" : "s"}`);
      toast.success(`Logged ${submittedEntries[0]?.carbs ?? "?"}g carbs`);
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(["carb-entries"], context?.previousCarbs ?? []);
      queryClient.setQueryData(["carb-entries", "graph"], context?.previousGraphCarbs ?? []);
      console.error("Unable to log carbs", error);
      toast.error(error?.message || "Unable to log carbs. Please check the carb entry fields.");
    },
  });
  const updateInsulinRow = (id, patch) => {
    setInsulinRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addInsulinRow = () => {
    const previous = insulinRows[insulinRows.length - 1];
    setInsulinRows((rows) => [
      ...rows,
      createInsulinRow({
        insulinType: previous?.insulinType || "",
        purpose: previous?.purpose || "meal",
      }),
    ]);
  };

  const removeInsulinRow = (id) => {
    setInsulinRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== id)));
  };

  const insulinTotals = insulinRows.reduce((totals, row) => {
    const units = Number(row.units);
    if (!row.insulinType || !Number.isFinite(units) || units <= 0) return totals;

    totals[row.insulinType] = (totals[row.insulinType] || 0) + units;
    return totals;
  }, {});

  const totalUnits = Object.values(insulinTotals).reduce((sum, units) => sum + units, 0);

  const handleSubmitInsulin = () => {
    if (loggingTab) return;

    const invalidRow = insulinRows.find((row) => {
      const units = Number(row.units);
      return !row.insulinType || !Number.isFinite(units) || units <= 0;
    });

    if (invalidRow) {
      toast.error("Choose an insulin type and enter units for every row.");
      return;
    }

    const administeredAt = buildTodayTimestampNoFuture(insulinTime);
    if (!administeredAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    const groupedDoses = insulinRows.reduce((groups, row) => {
      const units = Number(row.units);
      const existing = groups[row.insulinType] || {
        insulin_type: row.insulinType,
        units: 0,
        meal_units: 0,
        correction_units: 0,
        administered_at: administeredAt.toISOString(),
        notes: insulinNotes || undefined,
      };

      existing.units += units;
      if (row.purpose === "correction") {
        existing.correction_units += units;
      } else {
        existing.meal_units += units;
      }

      groups[row.insulinType] = existing;
      return groups;
    }, {});

    const submittedDoses = Object.values(groupedDoses);
    const optimisticDoses = submittedDoses.map((dose, index) => ({
      ...dose,
      id: `optimistic-dose-${Date.now()}-${index}`,
      created_date: new Date().toISOString(),
    }));

    setLoggingTab("insulin");
    runSaveAfterLoggingPaint(() => createDoses.mutate({ submittedDoses, optimisticDoses }), () => {
      setInsulinRows([createInsulinRow()]);
      setInsulinNotes("");
      setInsulinTime(new Date().toTimeString().slice(0, 5));
    });
  };

  const handleSubmitGlucose = () => {
    if (loggingTab) return;

    const value = Number(glucoseValue);
    if (!Number.isFinite(value) || value <= 0) return;

    const recordedAt = buildTodayTimestampNoFuture(glucoseTime);
    if (!recordedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    const submittedReading = {
      value,
      recorded_at: recordedAt.toISOString(),
      notes: glucoseNotes || undefined,
    };
    const optimisticReading = {
      ...submittedReading,
      id: `optimistic-glucose-${Date.now()}`,
      created_date: new Date().toISOString(),
    };

    setLoggingTab("glucose");
    runSaveAfterLoggingPaint(() => createGlucose.mutate({ submittedReading, optimisticReading }), () => {
      setGlucoseValue("");
      setGlucoseNotes("");
      setGlucoseTime(new Date().toTimeString().slice(0, 5));
    });
  };

  const handleSubmitCarbs = (entries) => {
    if (loggingTab) return;

    const submittedEntries = entries.map(normalizeCarbEntryForSave).filter((entry) => entry.carbs > 0);

    if (!submittedEntries.length) {
      toast.error("Enter carbs before logging.");
      return;
    }

    const optimisticEntries = submittedEntries.map((entry, index) => ({
      ...entry,
      id: `optimistic-carb-${Date.now()}-${index}`,
      created_date: new Date().toISOString(),
    }));

    setLoggingTab("carbs");
    runSaveAfterLoggingPaint(() => createCarb.mutate({ submittedEntries, optimisticEntries }), () => {});
  };

  if (!renderSheet) return null;

  return (
    <Dialog open={renderSheet} onOpenChange={handleDialogOpenChange}>
      <DialogPortal>
        <style>{`
          .dose-form-content[data-state="open"] {
            animation: dose-form-sheet-in 420ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .dose-form-content[data-state="closed"] {
            animation: dose-form-sheet-out 260ms cubic-bezier(0.32, 0, 0.67, 0);
            opacity: 0;
            pointer-events: none;
            transform: translateY(100%);
          }

          @keyframes dose-form-sheet-in {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }

          @keyframes dose-form-sheet-out {
            from { transform: translateY(0); }
            to { transform: translateY(100%); }
          }

          .dose-form-content input,
          .dose-form-content select,
          .dose-form-content textarea {
            font-size: 16px;
          }

          @media (min-width: 640px) {
            .dose-form-content[data-state="open"] {
              animation-name: dose-form-dialog-in;
            }

            .dose-form-content[data-state="closed"] {
              animation-name: dose-form-dialog-out;
              transform: translate(-50%, calc(-50% + 16px)) scale(0.98);
            }

            @keyframes dose-form-dialog-in {
              from { opacity: 0; transform: translate(-50%, calc(-50% + 24px)) scale(0.96); }
              to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }

            @keyframes dose-form-dialog-out {
              from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
              to { opacity: 0; transform: translate(-50%, calc(-50% + 16px)) scale(0.98); }
            }
          }
        `}</style>
        <DialogOverlay
          className="fixed inset-0 z-50 sm:backdrop-blur-sm data-[state=closed]:pointer-events-none data-[state=closed]:opacity-0"
          style={{ background: "rgba(0, 0, 0, 0.75)" }}
        />
        <DialogPrimitive.Content
          className="dose-form-content fixed bottom-0 left-0 right-0 z-50 flex h-[92dvh] max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/5 shadow-2xl sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
          style={{
            background: "hsl(162,10%,8%)",
          }}
        >
          <div className="flex items-center justify-between px-6 pb-3 pt-5">
            <div className="w-8" />
            <span className="text-lg font-semibold text-white">Log Entry</span>
            <button
              type="button"
              onClick={requestClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white"
              aria-label="Close log form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-5 mb-2 flex rounded-2xl bg-white/[0.06] p-1">
            {[
              { id: "insulin", label: "Insulin", Icon: Syringe },
              { id: "glucose", label: "Glucose", Icon: Droplets },
              { id: "carbs", label: "Carbs", Icon: Wheat },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleTabChange(id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-colors ${
                  tab === id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={tabDirection} mode="popLayout">
              <motion.div
                key={tab}
                custom={tabDirection}
                variants={tabPanelVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.85 }}
                className="absolute inset-0 flex min-h-0 flex-col"
              >
                {tab === "carbs" ? (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-white/35">Loading carbs...</div>}>
                      <CarbsTab onSubmit={handleSubmitCarbs} isPending={loggingTab === "carbs" || createCarb.isPending} />
                    </Suspense>
                  </div>
                ) : tab === "insulin" ? (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
                      <div className="space-y-3">
                        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Insulin doses</p>

                        {insulinRows.map((row, index) => (
                          <div key={row.id} className="space-y-2">
                            <div className="grid grid-cols-1 gap-2">
                              <SelectField
                                label="Insulin type"
                                value={row.insulinType}
                                onChange={(value) => updateInsulinRow(row.id, { insulinType: value })}
                                options={insulinTypeOptions}
                                placeholder="Insulin type"
                              />

                              <NumberPadField
                                label="Units"
                                value={row.units}
                                onChange={(value) => updateInsulinRow(row.id, { units: value })}
                                placeholder="0"
                                maxLength={4}
                              />

                              <SelectField
                                label="Purpose"
                                value={row.purpose}
                                onChange={(value) => updateInsulinRow(row.id, { purpose: value })}
                                options={dosePurposeOptions}
                              />
                            </div>

                            {insulinRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeInsulinRow(row.id)}
                                className="flex items-center gap-1 px-1 text-xs text-white/35 transition hover:text-red-300"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove this row
                              </button>
                            )}
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={addInsulinRow}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm font-medium text-white/60 transition hover:border-teal-400/50 hover:bg-teal-400/5 hover:text-teal-300"
                        >
                          <Plus className="h-4 w-4" />
                          Add more insulin
                        </button>
                      </div>

                      <div className="mt-6 space-y-3">
                        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Time administered</p>
                        <TimeScrollField label="Administered at" value={insulinTime} onChange={setInsulinTime} max={nowTimeString} />
                      </div>

                      <div className="mt-6 space-y-3">
                        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Notes (optional)</p>
                        <TextPadField value={insulinNotes} onChange={setInsulinNotes} placeholder="e.g. before lunch" multiline />
                      </div>

                      <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
                        {Object.entries(insulinTotals).length ? (
                          Object.entries(insulinTotals).map(([type, units]) => (
                            <p key={type} className="text-sm font-semibold text-white/85">
                              {type.split(" ")[0]} {units % 1 === 0 ? units : units.toFixed(1)} units total
                            </p>
                          ))
                        ) : (
                          <p className="text-sm text-white/35">Add an insulin dose to see the total.</p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pb-6 pt-3">
                      <button
                        type="button"
                        onClick={handleSubmitInsulin}
                        disabled={!totalUnits || loggingTab === "insulin" || createDoses.isPending}
                        className="w-full rounded-2xl bg-teal-500 py-4 text-base font-semibold text-white transition hover:bg-teal-400 disabled:opacity-40"
                      >
                        {loggingTab === "insulin" || createDoses.isPending
                          ? "Logging..."
                          : totalUnits
                            ? `Log ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(1)} units`
                            : "Add insulin units"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
                      <p className="block text-sm font-bold uppercase tracking-widest text-white/40">
                        Blood glucose (mg/dL)
                      </p>
                      <div className="mt-3">
                        <NumberPadField
                          label="Glucose"
                          value={glucoseValue}
                          onChange={(value) => setGlucoseValue(value.replace(/\D/g, "").slice(0, 3))}
                          unit="mg/dL"
                          decimal={false}
                          maxLength={3}
                          large
                        />
                      </div>

                      <div className="mt-6 space-y-3">
                        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Time</p>
                        <TimeScrollField label="Reading time" value={glucoseTime} onChange={setGlucoseTime} max={nowTimeString} />
                      </div>

                      <div className="mt-6 space-y-3">
                        <p className="px-1 text-sm font-bold uppercase tracking-widest text-white/40">Notes (optional)</p>
                        <TextPadField value={glucoseNotes} onChange={setGlucoseNotes} placeholder="e.g. fasting, after meal" multiline />
                      </div>
                    </div>

                    <div className="shrink-0 px-5 pb-6 pt-3">
                      <button
                        type="button"
                        onClick={handleSubmitGlucose}
                        disabled={!glucoseValue || loggingTab === "glucose" || createGlucose.isPending}
                        className="w-full rounded-2xl bg-orange-600 py-4 text-base font-semibold text-white transition hover:bg-orange-500 disabled:opacity-40"
                      >
                        {loggingTab === "glucose" || createGlucose.isPending ? "Logging..." : `Log ${glucoseValue || "--"} mg/dL`}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
